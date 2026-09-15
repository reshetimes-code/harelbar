const { onValueCreated } = require("firebase-functions/v2/database");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { GoogleGenAI } = require("@google/genai");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const ADMIN_EMAIL = "orenshp77@gmail.com";
const SCREEN_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const SCREEN_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const geminiApiKey = defineSecret("GEMINI_API_KEY");
const adminPassword = defineSecret("ADMIN_PASSWORD");
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");

// ===== RATE LIMITING (defense against password brute-forcing) =====
// Tracks attempts per client IP per endpoint in a server-only DB path
// (not reachable by clients - the Admin SDK always bypasses security rules).
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 15;

// Each event's organizer can register their own notification email (set via
// the admin panel). Falls back to the developer's ADMIN_EMAIL when the event
// hasn't configured one, so existing events keep working unchanged.
function resolveNotifyEmail(meta) {
  const candidate = typeof meta.notifyEmail === "string" ? meta.notifyEmail.trim() : "";
  if (candidate && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return candidate;
  return ADMIN_EMAIL;
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.ip || "unknown";
}

function sanitizeRateLimitKey(raw) {
  return String(raw).replace(/[.#$[\]/]/g, "_").slice(0, 100);
}

async function checkRateLimit(name, req) {
  const ip = sanitizeRateLimitKey(getClientIp(req));
  const ref = admin.database().ref(`/rateLimits/${name}_${ip}`);
  const now = Date.now();
  const result = await ref.transaction((current) => {
    if (!current || !current.windowStart || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
      return { windowStart: now, count: 1 };
    }
    return { windowStart: current.windowStart, count: (current.count || 0) + 1 };
  });
  const data = result.committed && result.snapshot.exists() ? result.snapshot.val() : null;
  return !data || data.count <= RATE_LIMIT_MAX_ATTEMPTS;
}

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "orenshp77@gmail.com",
      pass: gmailAppPassword.value(),
    },
  });
}

// Check blessing content with Gemini AI (text + image)
async function checkBlessingContent(name, text, photoDataUrl) {
  try {
    const prompt = `You are a strict content filter for a family celebration event. This text is in Hebrew. First translate it to English in your mind, then analyze the MEANING.

Sender name: "${name}"
Blessing text: "${text}"

${photoDataUrl ? "Also check the attached image." : ""}

REJECT the blessing if it contains ANY of the following:
- Curse words, profanity, insults (even mild ones like "idiot", "stupid")
- Sexual content, innuendos, or romantic inappropriateness
- Stories about cheating, affairs, betrayal between partners
- Gossip, rumors, revealing secrets about people
- Stories about being caught with someone, bathroom encounters
- Violence, threats, or intimidation
- Racism, discrimination, hate speech
- Spam, advertising, or irrelevant content
- Repeated meaningless characters (like "aaabbbbcccc")
- Slang insults or derogatory Hebrew slang such as "סעממק" and similar offensive slang expressions
- Anything that could embarrass someone at a family event
${photoDataUrl ? "- Images with sexual content, nudity, violence, or inappropriate content for a family event" : ""}
${photoDataUrl ? "- Images that look digitally manipulated, composited, photoshopped, or AI-generated in a way that places a real person into a fabricated scene (mismatched lighting/shadows, odd edges around a person, unnatural blending, warped background, inconsistent proportions or texture)" : ""}
${photoDataUrl ? "- Images implying a romantic/sexual relationship, infidelity, or any embarrassing or defamatory scenario involving identifiable people, even without nudity" : ""}
${photoDataUrl ? "- Photos of screens, other photos, or printed pictures (a photo of a photo), which are an easy way to sneak in unrelated or fabricated imagery" : ""}

APPROVE the blessing if it is:
- Warm wishes, congratulations, blessings
- Words of encouragement or love
- Short or simple text that is not offensive
${photoDataUrl ? "- A normal, clearly authentic, appropriate photo for a family event (selfie, group photo, event photo)" : ""}

Default for TEXT: APPROVE (only reject if clearly inappropriate).
${photoDataUrl ? "Default for IMAGES: be more cautious than with text. If you have real doubt about whether a photo is genuine/appropriate rather than manipulated or out of place, REJECT it and explain the doubt as the reason - a human will make the final call anyway." : ""}

החזר תשובה בפורמט הבא בלבד (שורה אחת):
APPROVED - אם הברכה תקינה
REJECTED - אם הברכה פוגענית (ואז הוסף סיבה קצרה)`;

    const contents = [];

    // Add text
    contents.push({ text: prompt });

    // Add image if exists
    if (photoDataUrl) {
      const matches = photoDataUrl.match(/^data:image\/(.*?);base64,(.*)$/);
      if (matches) {
        contents.push({
          inlineData: {
            mimeType: "image/" + matches[1],
            data: matches[2],
          },
        });
      }
    }

    const genAI = new GoogleGenAI({ apiKey: geminiApiKey.value() });
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: contents,
    });

    const responseText = response.text.trim();
    console.log("Gemini response:", responseText);

    if (responseText.startsWith("REJECTED")) {
      return { approved: false, reason: responseText.replace("REJECTED", "").trim().replace(/^-\s*/, "") };
    }
    return { approved: true, reason: "" };
  } catch (error) {
    console.error("Gemini error:", error);
    // If AI fails, let it through for manual review
    return { approved: true, reason: "" };
  }
}

// Trigger when new blessing is created (multi-tenant path)
exports.onNewBlessing = onValueCreated(
  { ref: "/events/{eventId}/blessings/{blessingId}", region: "us-central1", secrets: [geminiApiKey, adminPassword, gmailAppPassword] },
  async (event) => {
    const blessing = event.data.val();
    const blessingId = event.params.blessingId;
    const eventId = event.params.eventId;

    // Read event meta for celebrant name
    const metaSnap = await admin.database().ref(`/events/${eventId}/meta`).once("value");
    const meta = metaSnap.val() || {};
    const celebrantName = meta.celebrantName || "האירוע";

    // AI content check (text + image)
    const check = await checkBlessingContent(blessing.name, blessing.text, blessing.photoDataUrl || null);

    if (!check.approved) {
      // Auto-reject inappropriate content
      await admin.database().ref(`/events/${eventId}/blessings/${blessingId}/status`).set("rejected");
      await admin.database().ref(`/events/${eventId}/blessings/${blessingId}/rejectReason`).set(check.reason);
      console.log("Auto-rejected blessing:", eventId, blessingId, check.reason);

      // Still notify admin with approve button
      const approveAnywayUrl = `https://approvblessing-ayhgolerzq-uc.a.run.app?event=${eventId}&id=${blessingId}&action=approve&password=${encodeURIComponent(adminPassword.value())}`;
      const mailOptions = {
        from: `"מערכת ברכות" <orenshp77@gmail.com>`,
        to: resolveNotifyEmail(meta),
        subject: `⚠️ ברכה נדחתה - ${celebrantName} - ${blessing.name}`,
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif; max-width:500px; margin:0 auto; background:#2a0a0a; color:#fff; border-radius:12px; overflow:hidden;">
            <div style="background:#3a0a0a; padding:16px; text-align:center; border-bottom:1px solid rgba(255,0,0,0.2);">
              <h2 style="color:#e55; margin:0; font-size:18px;">⚠️ ברכה נדחתה אוטומטית</h2>
              <p style="color:rgba(255,255,255,0.5); margin:4px 0 0; font-size:13px;">אירוע: ${celebrantName}</p>
            </div>
            <div style="padding:20px; text-align:center;">
              <h3 style="color:#e55; margin:0 0 8px;">${blessing.name}</h3>
              <p style="color:rgba(255,255,255,0.7); line-height:1.8; font-size:14px; margin:0 0 12px;">${blessing.text}</p>
              <p style="color:#e55; font-size:13px; margin:0 0 20px; background:rgba(255,0,0,0.1); padding:8px 12px; border-radius:6px;">סיבה: ${check.reason}</p>
              <div style="margin-top:20px;">
                <a href="${approveAnywayUrl}" style="display:inline-block; padding:12px 32px; background:#b8953e; color:#0c1425; text-decoration:none; border-radius:8px; font-weight:bold; font-size:16px;">אשר בכל זאת</a>
              </div>
            </div>
          </div>
        `,
      };
      await getTransporter().sendMail(mailOptions);
      return;
    }

    // Content is OK - check if auto mode.
    // Photos ALWAYS require manual human review, even in auto mode - an AI check
    // can't be trusted alone to catch manipulated/fabricated photos, so every photo
    // still waits for a person to look at it before it can reach the screen.
    const hasPhoto = typeof blessing.photoDataUrl === "string" && blessing.photoDataUrl.length > 0;
    const isAutoMode = meta.autoMode === true && !hasPhoto;

    if (isAutoMode) {
      // Auto mode: approve directly, no email (text-only blessings only)
      await admin.database().ref(`/events/${eventId}/blessings/${blessingId}/status`).set("approved");
      console.log("Auto-approved blessing (auto mode):", eventId, blessingId);
      return;
    }

    // Manual mode (or a photo was attached): set pending and send approval email
    await admin.database().ref(`/events/${eventId}/blessings/${blessingId}/status`).set("pending");

    const approveUrl = `https://approvblessing-ayhgolerzq-uc.a.run.app?event=${eventId}&id=${blessingId}&action=approve&password=${encodeURIComponent(adminPassword.value())}`;
    const rejectUrl = `https://approvblessing-ayhgolerzq-uc.a.run.app?event=${eventId}&id=${blessingId}&action=reject&password=${encodeURIComponent(adminPassword.value())}`;

    const attachments = [];
    let imgTag = "";
    if (blessing.photoDataUrl) {
      const matches = blessing.photoDataUrl.match(/^data:image\/(.*?);base64,(.*)$/);
      if (matches) {
        attachments.push({
          filename: "photo.jpg",
          content: matches[2],
          encoding: "base64",
          cid: "blessingphoto",
        });
        imgTag = `<img src="cid:blessingphoto" style="width:200px; height:200px; object-fit:cover; border-radius:8px; margin-bottom:16px;" />`;
      }
    }

    const mailOptions = {
      from: `"מערכת ברכות" <orenshp77@gmail.com>`,
      to: resolveNotifyEmail(meta),
      subject: `ברכה חדשה - ${celebrantName} - מ${blessing.name}`,
      attachments,
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif; max-width:500px; margin:0 auto; background:#111c32; color:#fff; border-radius:12px; overflow:hidden;">
          <div style="background:#0c1425; padding:16px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.1);">
            <h2 style="color:#d4b065; margin:0; font-size:18px;">✅ ברכה חדשה התקבלה</h2>
            <p style="color:rgba(255,255,255,0.5); margin:4px 0 0; font-size:13px;">אירוע: ${celebrantName}</p>
          </div>
          <div style="padding:20px; text-align:center;">
            ${imgTag}
            <h3 style="color:#d4b065; margin:0 0 8px;">${blessing.name}</h3>
            <p style="color:rgba(255,255,255,0.7); line-height:1.8; font-size:14px; margin:0 0 24px;">${blessing.text}</p>
            <div>
              <a href="${approveUrl}" style="display:inline-block; padding:12px 32px; background:#b8953e; color:#0c1425; text-decoration:none; border-radius:8px; font-weight:bold; font-size:16px; margin:4px;">אשר העלאה</a>
              <a href="${rejectUrl}" style="display:inline-block; padding:12px 32px; background:#333; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold; font-size:16px; border:1px solid #555; margin:4px;">דחה</a>
            </div>
          </div>
        </div>
      `,
    };

    try {
      await getTransporter().sendMail(mailOptions);
      console.log("Email sent for blessing:", eventId, blessingId);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  }
);

// Manage per-event screen images.
exports.screenImages = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("screenImages", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { action, eventId, password, dataUrl, imageId } = req.body || {};

    if (!eventId || !/^[a-z0-9]{4,20}$/.test(eventId) || !["list", "upload", "delete"].includes(action)) {
      res.status(400).json({ ok: false, error: "invalid_request" });
      return;
    }

    try {
      const authorized = await isAuthorizedForEvent(eventId, password);
      if (!authorized) {
        res.status(403).json({ ok: false, error: "unauthorized" });
        return;
      }

      const imagesRef = admin.database().ref(`/events/${eventId}/screenImages`);

      if (action === "upload") {
        const parsed = parseScreenImageDataUrl(dataUrl);
        if (!parsed.ok) {
          const status = parsed.error === "image_too_large" ? 413 : 400;
          res.status(status).json({ ok: false, error: parsed.error, code: parsed.error });
          return;
        }

        const ref = imagesRef.push();
        await ref.set({
          dataUrl,
          mimeType: parsed.mimeType,
          size: parsed.size,
          fileName: typeof req.body.fileName === "string" ? req.body.fileName.substring(0, 120) : "",
          createdAt: new Date().toISOString(),
        });

        res.json({ ok: true, images: await listScreenImages(imagesRef) });
        return;
      }

      if (action === "delete") {
        if (!imageId || !/^[A-Za-z0-9_-]+$/.test(imageId)) {
          res.status(400).json({ ok: false, error: "invalid_image" });
          return;
        }

        await imagesRef.child(imageId).remove();
        res.json({ ok: true, images: await listScreenImages(imagesRef) });
        return;
      }

      res.json({ ok: true, images: await listScreenImages(imagesRef) });
    } catch (error) {
      console.error("screenImages error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

// HTTP endpoint to approve/reject blessings (multi-tenant)
exports.approvBlessing = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    const { event: eventId, id, action, password } = req.query;

    if (!eventId || !id || !["approve", "reject"].includes(action)) {
      res.status(400).send("Invalid request");
      return;
    }

    if (!(await checkRateLimit("approvBlessing", req))) {
      res.status(429).send(htmlResponse("יותר מדי ניסיונות", "נסו שוב בעוד כמה דקות", "#e55"));
      return;
    }

    try {
      const authorized = await isAuthorizedForEvent(eventId, password);
      if (!authorized) {
        res.status(403).send(htmlResponse("אין הרשאה", "הקישור לא תקין או שהסיסמה שגויה", "#e55"));
        return;
      }

      const ref = admin.database().ref(`/events/${eventId}/blessings/${id}`);
      const snapshot = await ref.once("value");

      if (!snapshot.exists()) {
        res.send(htmlResponse("הברכה לא נמצאה", "ייתכן שהיא כבר נמחקה", "#e55"));
        return;
      }

      if (action === "approve") {
        await ref.child("status").set("approved");
        res.send(htmlResponse("הברכה אושרה!", "הברכה תעלה למצגת מיד", "#b8953e"));
      } else {
        await ref.child("status").set("rejected");
        res.send(htmlResponse("הברכה נדחתה", "הברכה לא תוצג במצגת", "#e55"));
      }
    } catch (error) {
      console.error("Error:", error);
      res.status(500).send("Server error");
    }
  }
);

// HTTP endpoint to restore/permanently-purge a trashed blessing (multi-tenant).
// Uses the Admin SDK so it can write a blessing back with its original
// `status` intact - the client-side database rules deliberately forbid a
// direct client write from ever setting `status` (that's what keeps a guest
// from self-approving a new blessing), so a restore has to go through here.
exports.manageTrash = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    const { event: eventId, id, action, password } = req.query;

    if (!eventId || !id || !["restore", "purge"].includes(action)) {
      res.status(400).json({ ok: false, error: "invalid_request" });
      return;
    }

    if (!(await checkRateLimit("manageTrash", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    try {
      const authorized = await isAuthorizedForEvent(eventId, password);
      if (!authorized) {
        res.status(403).json({ ok: false, error: "unauthorized" });
        return;
      }

      const trashRef = admin.database().ref(`/events/${eventId}/trash/${id}`);
      const snapshot = await trashRef.once("value");
      if (!snapshot.exists()) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
      }

      if (action === "restore") {
        const blessing = snapshot.val();
        delete blessing.deletedAt;
        await admin.database().ref(`/events/${eventId}/blessings/${id}`).set(blessing);
      }
      await trashRef.remove();
      res.json({ ok: true });
    } catch (error) {
      console.error("manageTrash error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

// Sub-admin login: takes a password, returns the matching eventId without
// ever exposing the full password list to the client.
exports.subAdminLogin = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("login", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { password, username } = req.body || {};
    if (!password || typeof password !== "string") {
      res.status(400).json({ ok: false, error: "invalid_request" });
      return;
    }

    // Event manager - identified by username, scoped to only the events they own.
    if (username && typeof username === "string") {
      try {
        const managersSnap = await admin.database().ref("/managers").once("value");
        const managers = managersSnap.val() || {};
        const managerId = Object.keys(managers).find(
          (id) => managers[id].username === username && String(managers[id].password) === password
        );
        if (!managerId) {
          res.status(401).json({ ok: false, error: "invalid_password" });
          return;
        }
        res.json({ ok: true, role: "manager", managerId, name: managers[managerId].name || managers[managerId].username });
      } catch (error) {
        console.error("subAdminLogin (manager) error:", error);
        res.status(500).json({ ok: false, error: "server_error" });
      }
      return;
    }

    // Main admin - checked first, never touches the sub-admin password list.
    if (password === adminPassword.value()) {
      res.json({ ok: true, isMainAdmin: true });
      return;
    }

    try {
      const snap = await admin.database().ref("/passwords").once("value");
      const data = snap.val() || {};
      const eventId = Object.keys(data).find((id) => String(data[id]) === password);
      if (!eventId) {
        res.status(401).json({ ok: false, error: "invalid_password" });
        return;
      }
      res.json({ ok: true, eventId, isMainAdmin: false });
    } catch (error) {
      console.error("subAdminLogin error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

// Main-admin-only: read the leads list without exposing it to public DB reads.
exports.getLeads = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("getLeads", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { password } = req.body || {};
    if (password !== adminPassword.value()) {
      res.status(403).json({ ok: false, error: "unauthorized" });
      return;
    }

    try {
      const snap = await admin.database().ref("/leads").once("value");
      const data = snap.val() || {};
      const leads = Object.keys(data).map((id) => Object.assign({ id }, data[id]));
      res.json({ ok: true, leads });
    } catch (error) {
      console.error("getLeads error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

// Main-admin-only: list all events (with each event's current sub-admin
// password merged in) without exposing the full events tree to public DB reads.
exports.getEvents = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("getEvents", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { password } = req.body || {};
    if (password !== adminPassword.value()) {
      res.status(403).json({ ok: false, error: "unauthorized" });
      return;
    }

    try {
      const [eventsSnap, passwordsSnap] = await Promise.all([
        admin.database().ref("/events").once("value"),
        admin.database().ref("/passwords").once("value"),
      ]);
      const eventsData = eventsSnap.val() || {};
      const passwordsData = passwordsSnap.val() || {};
      const events = Object.keys(eventsData).map((id) => {
        const meta = Object.assign({}, eventsData[id].meta || {});
        meta.subAdminPassword = passwordsData[id] || "";
        return {
          id,
          meta,
          blessingCount: eventsData[id].blessings ? Object.keys(eventsData[id].blessings).length : 0,
        };
      });
      res.json({ ok: true, events });
    } catch (error) {
      console.error("getEvents error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

// Read/change a specific event's sub-admin password (main admin, or that
// event's own current password, may call this).
exports.getEventPassword = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("getEventPassword", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { eventId, password } = req.body || {};
    if (!eventId || typeof eventId !== "string") {
      res.status(400).json({ ok: false, error: "invalid_request" });
      return;
    }

    try {
      const authorized = await isAuthorizedForEvent(eventId, password);
      if (!authorized) {
        res.status(403).json({ ok: false, error: "unauthorized" });
        return;
      }
      const snap = await admin.database().ref(`/passwords/${eventId}`).once("value");
      res.json({ ok: true, password: String(snap.val() || "") });
    } catch (error) {
      console.error("getEventPassword error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

exports.setEventPassword = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("setEventPassword", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { eventId, password, newPassword } = req.body || {};
    if (!eventId || typeof eventId !== "string" || typeof newPassword !== "string" || newPassword.length < 1 || newPassword.length > 20) {
      res.status(400).json({ ok: false, error: "invalid_request" });
      return;
    }

    try {
      const authorized = await isAuthorizedForEvent(eventId, password);
      if (!authorized) {
        res.status(403).json({ ok: false, error: "unauthorized" });
        return;
      }
      await admin.database().ref(`/passwords/${eventId}`).set(newPassword);
      res.json({ ok: true });
    } catch (error) {
      console.error("setEventPassword error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

function setCorsHeaders(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

async function isAuthorizedForEvent(eventId, password) {
  if (!password || typeof password !== "string") return false;
  if (password === adminPassword.value()) return true;

  const pwdSnap = await admin.database().ref(`/passwords/${eventId}`).once("value");
  return String(pwdSnap.val() || "") === password;
}

function parseScreenImageDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return { ok: false, error: "invalid_image" };
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return { ok: false, error: "invalid_image" };

  const mimeType = match[1].toLowerCase();
  if (!SCREEN_IMAGE_MIME_TYPES.has(mimeType)) return { ok: false, error: "unsupported_image" };

  const base64 = match[2];
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const size = Math.floor((base64.length * 3) / 4) - padding;
  if (size > SCREEN_IMAGE_MAX_BYTES) return { ok: false, error: "image_too_large" };

  return { ok: true, mimeType, size };
}

async function listScreenImages(imagesRef) {
  const snap = await imagesRef.once("value");
  const data = snap.val() || {};
  return Object.keys(data).map((id) => ({
    id,
    dataUrl: data[id].dataUrl,
    mimeType: data[id].mimeType || "",
    size: data[id].size || 0,
    createdAt: data[id].createdAt || "",
  })).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

// ===== EVENT MANAGERS (mid-tier role under the super admin: owns a subset of
// events they created, no access to other managers' events or site-wide tools) =====

function generateEventId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

function generateEventPassword() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generateManagerId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

async function isAuthorizedManager(managerId, password) {
  if (!managerId || typeof managerId !== "string" || !password || typeof password !== "string") return false;
  const snap = await admin.database().ref(`/managers/${managerId}`).once("value");
  const manager = snap.val();
  return !!manager && String(manager.password) === password;
}

function mergeEventPassword(id, eventsData, passwordsData) {
  const meta = Object.assign({}, eventsData[id].meta || {});
  meta.subAdminPassword = passwordsData[id] || "";
  return {
    id,
    meta,
    blessingCount: eventsData[id].blessings ? Object.keys(eventsData[id].blessings).length : 0,
  };
}

// Manager-only: list just the events this manager owns.
exports.getManagerEvents = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("getManagerEvents", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { managerId, password } = req.body || {};
    if (!(await isAuthorizedManager(managerId, password))) {
      res.status(403).json({ ok: false, error: "unauthorized" });
      return;
    }

    try {
      const [eventsSnap, passwordsSnap] = await Promise.all([
        admin.database().ref("/events").once("value"),
        admin.database().ref("/passwords").once("value"),
      ]);
      const eventsData = eventsSnap.val() || {};
      const passwordsData = passwordsSnap.val() || {};
      const events = Object.keys(eventsData)
        .filter((id) => eventsData[id].meta && eventsData[id].meta.ownerId === managerId)
        .map((id) => mergeEventPassword(id, eventsData, passwordsData));
      res.json({ ok: true, events });
    } catch (error) {
      console.error("getManagerEvents error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

// Manager-only: create a new event, stamped with this manager's ownerId server-side.
// This always runs through the Admin SDK (never a direct client write like
// register.html uses) so a manager can never forge another manager's ownerId -
// there's no Firebase Auth here for security rules to check that against.
exports.createManagerEvent = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("createManagerEvent", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { managerId, password, celebrantName, organizerName, organizerPhone, eventDate, notifyEmail } = req.body || {};
    if (!(await isAuthorizedManager(managerId, password))) {
      res.status(403).json({ ok: false, error: "unauthorized" });
      return;
    }
    if (!celebrantName || !organizerName || !organizerPhone || !eventDate) {
      res.status(400).json({ ok: false, error: "invalid_request" });
      return;
    }

    try {
      const eventId = generateEventId();
      const meta = {
        celebrantName: String(celebrantName).slice(0, 99),
        organizerName: String(organizerName).slice(0, 99),
        organizerPhone: String(organizerPhone).slice(0, 19),
        eventDate: String(eventDate),
        createdAt: new Date().toISOString(),
        status: "active",
        ownerId: managerId,
      };
      if (notifyEmail) meta.notifyEmail = String(notifyEmail).slice(0, 199);

      const subAdminPassword = generateEventPassword();
      await admin.database().ref(`/events/${eventId}/meta`).set(meta);
      await Promise.all([
        admin.database().ref(`/passwords/${eventId}`).set(subAdminPassword),
        admin.database().ref(`/eventIndex/${eventId}`).set({ createdAt: meta.createdAt }),
      ]);
      res.json({ ok: true, eventId });
    } catch (error) {
      console.error("createManagerEvent error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

// Main-admin-only: create a new event-manager account.
exports.createEventManager = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("createEventManager", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { password, username, name, managerPassword } = req.body || {};
    if (password !== adminPassword.value()) {
      res.status(403).json({ ok: false, error: "unauthorized" });
      return;
    }
    const cleanUsername = typeof username === "string" ? username.trim() : "";
    if (!cleanUsername || cleanUsername.length > 50 || !managerPassword || typeof managerPassword !== "string" || managerPassword.length < 1 || managerPassword.length > 40) {
      res.status(400).json({ ok: false, error: "invalid_request" });
      return;
    }

    try {
      const managersSnap = await admin.database().ref("/managers").once("value");
      const managers = managersSnap.val() || {};
      const exists = Object.keys(managers).some((id) => managers[id].username === cleanUsername);
      if (exists) {
        res.status(409).json({ ok: false, error: "username_taken" });
        return;
      }
      const managerId = generateManagerId();
      await admin.database().ref(`/managers/${managerId}`).set({
        username: cleanUsername,
        name: (typeof name === "string" && name.trim()) ? name.trim().slice(0, 99) : cleanUsername,
        password: managerPassword,
        createdAt: new Date().toISOString(),
      });
      res.json({ ok: true, managerId });
    } catch (error) {
      console.error("createEventManager error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

// Public: self-service sign-up for an event-manager account (email + password).
// Unlike createEventManager this needs no admin password - anyone can register,
// same trust level as the existing one-off "open a new event" flow - but every
// account created this way still shows up in the super admin's managers table,
// since it's the same /managers node either way.
exports.signupEventManager = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("signupEventManager", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { email, name, password } = req.body || {};
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (
      !cleanEmail ||
      cleanEmail.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
      !password ||
      typeof password !== "string" ||
      password.length < 4 ||
      password.length > 40
    ) {
      res.status(400).json({ ok: false, error: "invalid_request" });
      return;
    }

    try {
      const managersSnap = await admin.database().ref("/managers").once("value");
      const managers = managersSnap.val() || {};
      const exists = Object.keys(managers).some((id) => managers[id].username === cleanEmail);
      if (exists) {
        res.status(409).json({ ok: false, error: "email_taken" });
        return;
      }
      const managerId = generateManagerId();
      const displayName = (typeof name === "string" && name.trim()) ? name.trim().slice(0, 99) : cleanEmail;
      await admin.database().ref(`/managers/${managerId}`).set({
        username: cleanEmail,
        name: displayName,
        password,
        createdAt: new Date().toISOString(),
      });
      res.json({ ok: true, managerId, name: displayName });
    } catch (error) {
      console.error("signupEventManager error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

// Main-admin-only: list all event managers, each with the events they own.
exports.getEventManagers = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("getEventManagers", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { password } = req.body || {};
    if (password !== adminPassword.value()) {
      res.status(403).json({ ok: false, error: "unauthorized" });
      return;
    }

    try {
      const [managersSnap, eventsSnap, passwordsSnap] = await Promise.all([
        admin.database().ref("/managers").once("value"),
        admin.database().ref("/events").once("value"),
        admin.database().ref("/passwords").once("value"),
      ]);
      const managersData = managersSnap.val() || {};
      const eventsData = eventsSnap.val() || {};
      const passwordsData = passwordsSnap.val() || {};

      const managers = Object.keys(managersData).map((id) => {
        const events = Object.keys(eventsData)
          .filter((eid) => eventsData[eid].meta && eventsData[eid].meta.ownerId === id)
          .map((eid) => mergeEventPassword(eid, eventsData, passwordsData));
        return {
          id,
          username: managersData[id].username,
          name: managersData[id].name || managersData[id].username,
          createdAt: managersData[id].createdAt || "",
          events,
        };
      });
      res.json({ ok: true, managers });
    } catch (error) {
      console.error("getEventManagers error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

// Main-admin-only: delete an event-manager account. Their events are kept
// (still visible to the main admin) rather than deleted along with them.
exports.deleteEventManager = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("deleteEventManager", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { password, managerId } = req.body || {};
    if (password !== adminPassword.value()) {
      res.status(403).json({ ok: false, error: "unauthorized" });
      return;
    }
    if (!managerId || typeof managerId !== "string") {
      res.status(400).json({ ok: false, error: "invalid_request" });
      return;
    }

    try {
      await admin.database().ref(`/managers/${managerId}`).remove();
      res.json({ ok: true });
    } catch (error) {
      console.error("deleteEventManager error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

// Main-admin-only: reset an event-manager's password.
exports.resetManagerPassword = onRequest(
  { region: "us-central1", secrets: [adminPassword] },
  async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    if (!(await checkRateLimit("resetManagerPassword", req))) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const { password, managerId, newPassword } = req.body || {};
    if (password !== adminPassword.value()) {
      res.status(403).json({ ok: false, error: "unauthorized" });
      return;
    }
    if (!managerId || typeof managerId !== "string" || !newPassword || typeof newPassword !== "string" || newPassword.length < 1 || newPassword.length > 40) {
      res.status(400).json({ ok: false, error: "invalid_request" });
      return;
    }

    try {
      const snap = await admin.database().ref(`/managers/${managerId}`).once("value");
      if (!snap.exists()) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
      }
      await admin.database().ref(`/managers/${managerId}/password`).set(newPassword);
      res.json({ ok: true });
    } catch (error) {
      console.error("resetManagerPassword error:", error);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  }
);

function htmlResponse(title, subtitle, color) {
  return `
    <!DOCTYPE html>
    <html dir="rtl">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title></head>
    <body style="margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0c1425; font-family:Arial,sans-serif;">
      <div style="text-align:center; color:#fff; padding:40px;">
        <div style="width:64px; height:64px; border-radius:50%; background:${color}22; color:${color}; display:flex; align-items:center; justify-content:center; font-size:28px; margin:0 auto 20px;">✓</div>
        <h1 style="color:${color}; margin:0 0 8px; font-size:24px;">${title}</h1>
        <p style="color:rgba(255,255,255,0.5); margin:0;">${subtitle}</p>
      </div>
    </body>
    </html>
  `;
}
