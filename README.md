# Telegram Roast Bot — Setup Guide

Way simpler than WhatsApp. No business verification, no tester limits, no review process.
You can be live in under 10 minutes.

---

## PART 1: Create the bot (2 min)

1. Open Telegram, search for **@BotFather** (the official bot for making bots).
2. Send `/newbot`.
3. Give it a name (e.g. "Roast Bot") — this is the display name.
4. Give it a username ending in `bot` (e.g. `naija_roast_bot`) — this becomes your shareable link.
5. BotFather replies with an **API token** — copy it. Looks like `123456789:ABCdefGhIJKlmNoPQRsTUVwxyz`.

Your bot's shareable link is now: `https://t.me/naija_roast_bot` (whatever username you picked).

---

## PART 2: Get a Groq API key (2 min)

1. https://console.groq.com → sign up → **API Keys** → create one → copy it.
(Skip if you already have one from before.)

---

## PART 3: Deploy to Vercel (5 min)

1. Take the `api/webhook.js` and `package.json` files I gave you.
2. Push to a GitHub repo, or deploy directly with Vercel CLI:
   ```
   npm i -g vercel
   cd roast-bot-tg
   vercel
   ```
3. In your Vercel project settings → **Environment Variables**, add:
   - `GROQ_API_KEY` — from Part 2
   - `TELEGRAM_BOT_TOKEN` — from Part 1
4. Deploy. You'll get a URL like `https://roast-bot-tg-yourname.vercel.app`.

---

## PART 4: Tell Telegram where your webhook is (1 min)

Telegram needs a one-time API call to point at your deployed URL. Run this in your
terminal (replace both placeholders):

```bash
curl "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://roast-bot-tg-yourname.vercel.app/api/webhook"
```

You should get back: `{"ok":true,"result":true,"description":"Webhook was set"}`

That's it — no dashboard clicking, no verify token, no review. Done.

---

## PART 5: Test it

1. Open `https://t.me/your_bot_username` in Telegram, hit **Start**.
2. Type "roast me" — you should get a reply in a couple seconds.
3. If nothing happens: Vercel → your project → **Logs**, check for errors there first.

---

## PART 6: Share it — no limits

Just drop `https://t.me/your_bot_username` straight into any WhatsApp group, Telegram
group, Twitter/X, wherever. Anyone who taps it opens a chat with your bot immediately —
**no tester whitelist, no 5-person cap, no review**. This is the big win over WhatsApp
for a fast launch.

---

## Notes
- Telegram bots are free with no message limits (unlike WhatsApp's paid tiers).
- If Groq ever rate-limits you under load, that's the first thing to watch in Logs —
  easy fix later is just catching that error and replying "too many people roasting rn, try again."
- Want group chat support too (bot responds when @mentioned in a group, not just DM)?
  That's a small addition to the webhook — just ask.
