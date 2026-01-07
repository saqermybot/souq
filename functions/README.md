# Telegram Reports Notification (Firebase Cloud Functions)

## 1) Requirements
- Firebase CLI installed (`npm i -g firebase-tools`)
- A Telegram bot token (from @BotFather)
- Your `chat_id` (from @userinfobot)

## 2) Setup
From your Firebase project folder, run:

```bash
firebase init functions
```

Then copy this folder contents (`functions/index.js` and `functions/package.json`) into the created `functions/` directory (or replace them).

## 3) Configure secrets
```bash
firebase functions:config:set telegram.token="<BOT_TOKEN>" telegram.chat_id="<CHAT_ID>"
```

## 4) Deploy
```bash
firebase deploy --only functions
```

## 5) Test
Open any listing and press **🚩 تبليغ**. A message should reach your Telegram.
