const { onValueCreated } = require("firebase-functions/v2/database");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const ADMIN_EMAIL = "orenshp77@gmail.com";
const APP_URL = "https://harelbar-ca7dd.web.app";

// Gmail SMTP - use App Password (not regular password)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "orenshp77@gmail.com",
    pass: "nktjnctgplbjchge",
  },
});

// Trigger when new blessing is created
exports.onNewBlessing = onValueCreated(
  { ref: "/blessings/{blessingId}", region: "us-central1" },
  async (event) => {
    const blessing = event.data.val();
    const blessingId = event.params.blessingId;

    // Set initial status to pending
    await admin.database().ref(`/blessings/${blessingId}/status`).set("pending");

    const approveUrl = `https://approvblessing-ayhgolerzq-uc.a.run.app?id=${blessingId}&action=approve`;
    const rejectUrl = `https://approvblessing-ayhgolerzq-uc.a.run.app?id=${blessingId}&action=reject`;

    // Prepare image attachment if exists
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
      from: `"מערכת ברכות הראלי" <orenshp77@gmail.com>`,
      to: ADMIN_EMAIL,
      subject: `ברכה חדשה מ${blessing.name}`,
      attachments,
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif; max-width:500px; margin:0 auto; background:#111c32; color:#fff; border-radius:12px; overflow:hidden;">
          <div style="background:#0c1425; padding:16px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.1);">
            <h2 style="color:#d4b065; margin:0; font-size:18px;">ברכה חדשה התקבלה!</h2>
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
