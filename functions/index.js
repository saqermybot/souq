// Firebase Cloud Function: send Telegram notification when a new report is created
// Deploy after setting config:
//   firebase functions:config:set telegram.token="<BOT_TOKEN>" telegram.chat_id="<CHAT_ID>"
//   firebase deploy --only functions

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

async function tgSend(text) {
  const token = functions.config().telegram.token;
  const chatId = functions.config().telegram.chat_id;
  if (!token || !chatId) {
    console.error("Missing telegram config (token/chat_id)");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  // Node 18+ has global fetch. If you use Node 16, install node-fetch and import it.
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Telegram sendMessage failed:", body);
  }
}

exports.onNewReport = functions.firestore
  .document("reports/{reportId}")
  .onCreate(async (snap, ctx) => {
    const r = snap.data() || {};

    const listingId = r.listingId || "";
    const title = r.listingTitle || "";
    const reason = r.reasonLabel || r.reason || "";
    const who = r.reporterEmail || r.reporterUid || "unknown";
    const type = r.type || "report";

    // If you have a dedicated details page, adjust this link
    const link = `https://souqsyria.org/#listing=${encodeURIComponent(listingId)}`;

    const msg =
`🚨 بلاغ جديد\n` +
`📌 الإعلان: ${title ? title + " — " : ""}${listingId}\n` +
`⚠️ السبب: ${reason}\n` +
`🧾 النوع: ${type}\n` +
`👤 من: ${who}\n` +
`🔗 الرابط: ${link}`;

    await tgSend(msg);
  });
