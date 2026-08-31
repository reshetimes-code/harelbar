const { onValueCreated } = require("firebase-functions/v2/database");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { GoogleGenAI } = require("@google/genai");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const ADMIN_EMAIL = "orenshp77@gmail.com";
const ADMIN_PASSWORD = "oren8773";
const SCREEN_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const SCREEN_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const geminiApiKey = defineSecret("GEMINI_API_KEY");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "orenshp77@gmail.com",
    pass: "nktjnctgplbjchge",
  },
});

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

APPROVE the blessing if it is:
- Warm wishes, congratulations, blessings
- Words of encouragement or love
- Short or simple text that is not offensive
${photoDataUrl ? "- A normal appropriate photo for a family event" : ""}

Default: APPROVE (only reject if clearly inappropriate)

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
  { ref: "/events/{eventId}/blessings/{blessingId}", region: "us-central1", secrets: [geminiApiKey] },
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
      const approveAnywayUrl = `https://approvblessing-ayhgolerzq-uc.a.run.app?event=${eventId}&id=${blessingId}&action=approve`;
      const mailOptions = {
        from: `"מערכת ברכות" <orenshp77@gmail.com>`,
        to: ADMIN_EMAIL,
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
      await transporter.sendMail(mailOptions);
      return;
    }

    // Content is OK - check if auto mode
    const isAutoMode = meta.autoMode === true;

    if (isAutoMode) {
      // Auto mode: approve directly, no email
      await admin.database().ref(`/events/${eventId}/blessings/${blessingId}/status`).set("approved");
      console.log("Auto-approved blessing (auto mode):", eventId, blessingId);
      return;
    }

    // Manual mode: set pending and send approval email
    await admin.database().ref(`/events/${eventId}/blessings/${blessingId}/status`).set("pending");

    const approveUrl = `https://approvblessing-ayhgolerzq-uc.a.run.app?event=${eventId}&id=${blessingId}&action=approve`;
    const rejectUrl = `https://approvblessing-ayhgolerzq-uc.a.run.app?event=${eventId}&id=${blessingId}&action=reject`;

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
      to: ADMIN_EMAIL,
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
      await transporter.sendMail(mailOptions);
      console.log("Email sent for blessing:", eventId, blessingId);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  }
);

// Manage per-event screen images.
exports.screenImages = onRequest(
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
  { region: "us-central1" },
  async (req, res) => {
    const { event: eventId, id, action } = req.query;

    if (!eventId || !id || !["approve", "reject"].includes(action)) {
      res.status(400).send("Invalid request");
      return;
    }

    try {
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

function setCorsHeaders(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

async function isAuthorizedForEvent(eventId, password) {
  if (!password || typeof password !== "string") return false;
  if (password === ADMIN_PASSWORD) return true;

  const pwdSnap = await admin.database().ref(`/passwords/${eventId}`).once("value");
  if (String(pwdSnap.val() || "") === password) return true;

  const metaSnap = await admin.database().ref(`/events/${eventId}/meta/subAdminPassword`).once("value");
  return String(metaSnap.val() || "") === password;
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
