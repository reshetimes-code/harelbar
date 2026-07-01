const { onValueCreated } = require("firebase-functions/v2/database");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { VertexAI } = require("@google-cloud/vertexai");

admin.initializeApp();

const ADMIN_EMAIL = "orenshp77@gmail.com";
const vertexAI = new VertexAI({ project: "harelbar-ca7dd", location: "us-central1" });

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "orenshp77@gmail.com",
    pass: "nktjnctgplbjchge",
  },
});

// Check blessing content with Gemini AI
async function checkBlessingContent(name, text) {
  try {
    const model = vertexAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });

    const prompt = `אתה מערכת סינון תוכן לאירוע בר מצווה. בדוק את הברכה הבאה וקבע אם היא מתאימה להצגה פומבית.

שם השולח: "${name}"
טקסט הברכה: "${text}"

דחה את הברכה אם היא מכילה:
- קללות, גידופים או מילים גסות
- רכילות, לשון הרע, או חשיפת מידע אישי על אנשים אחרים
- תוכן מיני, רומנטי לא ראוי, או רמזים מיניים
- בגידות, יחסים אסורים, או חשיפת סודות
- תוכן פוגעני, גזעני, או משפיל
- ספאם, פרסום, או תוכן לא רלוונטי
- כל דבר שיכול לגרום מבוכה למשפחה באירוע

אשר את הברכה אם היא:
- ברכה חמה ומתאימה לאירוע
- איחולים טובים
- דברי עידוד

החזר תשובה בפורמט הבא בלבד (שורה אחת):
APPROVED - אם הברכה תקינה
REJECTED - אם הברכה פוגענית (ואז הוסף סיבה קצרה)`;

    const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
    const response = result.response.candidates[0].content.parts[0].text.trim();
    console.log("Gemini response:", response);

    if (response.startsWith("REJECTED")) {
      return { approved: false, reason: response.replace("REJECTED", "").trim().replace(/^-\s*/, "") };
    }
    return { approved: true, reason: "" };
  } catch (error) {
    console.error("Gemini error:", error);
    // If AI fails, let it through for manual review
    return { approved: true, reason: "" };
  }
}

// Trigger when new blessing is created
exports.onNewBlessing = onValueCreated(
  { ref: "/blessings/{blessingId}", region: "us-central1" },
  async (event) => {
    const blessing = event.data.val();
    const blessingId = event.params.blessingId;

    // AI content check
    const check = await checkBlessingContent(blessing.name, blessing.text);

    if (!check.approved) {
      // Auto-reject inappropriate content
      await admin.database().ref(`/blessings/${blessingId}/status`).set("rejected");
      await admin.database().ref(`/blessings/${blessingId}/rejectReason`).set(check.reason);
      console.log("Auto-rejected blessing:", blessingId, check.reason);

      // Still notify admin
      const mailOptions = {
        from: `"מערכת ברכות הראל" <orenshp77@gmail.com>`,
        to: ADMIN_EMAIL,
        subject: `⚠️ ברכה נדחתה אוטומטית - ${blessing.name}`,
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif; max-width:500px; margin:0 auto; background:#2a0a0a; color:#fff; border-radius:12px; overflow:hidden;">
            <div style="background:#3a0a0a; padding:16px; text-align:center; border-bottom:1px solid rgba(255,0,0,0.2);">
              <h2 style="color:#e55; margin:0; font-size:18px;">⚠️ ברכה נדחתה אוטומטית</h2>
            </div>
            <div style="padding:20px; text-align:center;">
              <h3 style="color:#e55; margin:0 0 8px;">${blessing.name}</h3>
              <p style="color:rgba(255,255,255,0.7); line-height:1.8; font-size:14px; margin:0 0 12px;">${blessing.text}</p>
              <p style="color:#e55; font-size:13px; margin:0 0 20px; background:rgba(255,0,0,0.1); padding:8px 12px; border-radius:6px;">סיבה: ${check.reason}</p>
              <p style="color:rgba(255,255,255,0.4); font-size:12px;">אם זו טעות, אפשר לאשר ידנית מפאנל הניהול</p>
            </div>
          </div>
        `,
      };
      await transporter.sendMail(mailOptions);
      return;
    }

    // Content is OK - set pending and send approval email
    await admin.database().ref(`/blessings/${blessingId}/status`).set("pending");

    const approveUrl = `https://approvblessing-ayhgolerzq-uc.a.run.app?id=${blessingId}&action=approve`;
    const rejectUrl = `https://approvblessing-ayhgolerzq-uc.a.run.app?id=${blessingId}&action=reject`;

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
      from: `"מערכת ברכות הראל" <orenshp77@gmail.com>`,
      to: ADMIN_EMAIL,
      subject: `ברכה חדשה מ${blessing.name}`,
      attachments,
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif; max-width:500px; margin:0 auto; background:#111c32; color:#fff; border-radius:12px; overflow:hidden;">
          <div style="background:#0c1425; padding:16px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.1);">
            <h2 style="color:#d4b065; margin:0; font-size:18px;">✅ ברכה חדשה התקבלה</h2>
          </div>
          <div style="padding:20px; text-align:center;">
            ${imgTag}
            <h3 style="color:#d4b065; margin:0 0 8px;">${blessing.name}</h3>
            ${blessing.phone ? `<p style="color:rgba(255,255,255,0.4); font-size:12px; margin:0 0 8px; direction:ltr;">${blessing.phone}</p>` : ""}
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
      console.log("Email sent for blessing:", blessingId);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  }
);

// HTTP endpoint to approve/reject blessings
exports.approvBlessing = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    const { id, action } = req.query;

    if (!id || !["approve", "reject"].includes(action)) {
      res.status(400).send("Invalid request");
      return;
    }

    try {
      const ref = admin.database().ref(`/blessings/${id}`);
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
