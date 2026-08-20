# Weekly Match Bot — Setup Guide

Same pattern as the roast bot, plus one new piece: **Firestore**, so the bot
can remember who's answered what and pair people up weekly.

---

## PART 1: Telegram bot (same as before)

If this is a brand new bot, repeat what you did for the roast bot:
1. Message @BotFather → `/newbot` → get your token
(If you're reusing the same bot, skip this — just redeploy new code to it.)

---

## PART 2: Firebase setup (new step)

1. Go to https://console.firebase.google.com → your existing project (or create a new one)
2. Left sidebar → **Build → Firestore Database** → Create database (if not already set up) → start in production mode, pick a region close to you
3. Now get admin credentials: **Project Settings (gear icon) → Service Accounts tab**
4. Click **Generate new private key** → downloads a `.json` file
5. Open that JSON file (any text app), copy the ENTIRE contents

You'll paste that whole JSON blob as one environment variable in Part 4.

---

## PART 3: Groq key

Same as before — console.groq.com, skip if you already have one.

---

## PART 4: Deploy to Vercel

1. Push these files to a new GitHub repo — keep the exact structure:
   ```
   match-bot/
     api/webhook.js
     api/match.js
     api/_firebase.js
     package.json
     vercel.json
   ```
   (On GitHub mobile: create each file with the full path typed in, like `api/webhook.js`, same trick as before.)

2. Vercel → Add New Project → import the repo

3. Add these Environment Variables:
   - `GROQ_API_KEY` → your Groq key
   - `TELEGRAM_BOT_TOKEN` → your bot token
   - `FIREBASE_SERVICE_ACCOUNT_KEY` → paste the ENTIRE JSON file contents from Part 2 step 5, as one single value
   - `CRON_SECRET` → make up any random string, e.g. `matchbot-secret-2026`

4. Deploy

---

## PART 5: Connect Telegram webhook

Same as before — paste into your browser (swap in your real token + Vercel URL):

```
https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://your-vercel-url.vercel.app/api/webhook
```

---

## PART 6: Test onboarding

Message your bot `/start` — it should ask you 3 questions one at a time.
Answer all 3, it should confirm you're in the pool.

---

## PART 7: Test matching manually (before waiting a whole week)

The weekly cron won't fire until Monday 9am automatically. To test matching
right now with at least 2 people who've completed onboarding, visit this URL
in your browser (swap in your real values):

```
https://your-vercel-url.vercel.app/api/match
```

Wait — this will fail with "Unauthorized" because of CRON_SECRET protection.
To manually trigger it for testing, you need to send that secret as a header,
which a browser URL bar can't do. Easiest option: temporarily remove the
CRON_SECRET check from match.js for testing, or ask me and I'll walk you
through testing it properly once you've got 2+ test accounts onboarded.

---

## How the weekly cron works going forward

Once deployed, Vercel automatically calls `/api/match` every **Monday at
9am** (set in `vercel.json`) — you don't need to do anything. It'll pull
everyone who's completed onboarding and not been matched, pair them up,
generate an icebreaker via Groq, and DM both people.

## Known limitation to flag

If a matched user hasn't set a public Telegram username, the other person
can't easily reach them first — Telegram bots don't expose phone numbers
or force a DM. For now, both people just see each other's answers +
icebreaker, and whoever has a username visible gets contacted first. This is
fine for an MVP test, but worth fixing later (e.g. building a simple relay
so the bot forwards messages between matched pairs without needing usernames).
