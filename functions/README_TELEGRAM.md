# Telegram alerts for Reports (Firebase Cloud Functions)

This site is static (GitHub Pages). **Never send Telegram messages directly from the browser**, because your bot token becomes public.

Safe way: Firebase Cloud Function triggers on `reports/{id}` and sends you a Telegram message.

## 1) Create bot + get your chat id
1. Create a bot using **@BotFather** → `/newbot` → copy `BOT_TOKEN`.
2. Get your `CHAT_ID`: open **@userinfobot** → `/start` → copy `Your ID`.

## 2) Initialize functions (one time)
From your project root:

```bash
firebase init functions
```
Choose Node 18 if available.

## 3) Set Telegram secrets
```bash
firebase functions:config:set telegram.token="BOT_TOKEN_HERE" telegram.chat_id="CHAT_ID_HERE"
```

## 4) Put the code
Copy `functions/index.js` from this folder into your Firebase Functions project.

## 5) Deploy
```bash
firebase deploy --only functions
```

After that, any new report in Firestore will notify you on Telegram.
