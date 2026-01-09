# Telegram Reports Notifications (Firebase Cloud Functions)

This folder contains a single Cloud Function that sends a Telegram message whenever a new document is created in `reports/`.

## 1) Create Telegram bot + get IDs
- Create a bot using @BotFather and copy the `BOT_TOKEN`.
- Get your `CHAT_ID` (your user ID) using @userinfobot.

## 2) Initialize Firebase Functions (once)
From your project root:

```bash
firebase init functions
```

If you already have a `functions/` folder in your Firebase project, copy `index.js` content into it.

## 3) Set config (secure)
```bash
firebase functions:config:set telegram.token="<BOT_TOKEN>" telegram.chat_id="<CHAT_ID>"
```

## 4) Deploy
```bash
firebase deploy --only functions
```

## Notes
- This uses Node 18 (global `fetch`). If you deploy on Node 16, install `node-fetch` and import it.
- The link inside the Telegram message uses `https://souqsyria.org/#listing=<id>`.
  If your details URL is different, adjust it in `index.js`.
