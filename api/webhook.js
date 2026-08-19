// api/webhook.js
// Telegram sends every incoming message to this URL as a POST request.

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Bot is alive");
  }

  try {
    const message = req.body?.message;
    const chatId = message?.chat?.id;
    const userText = message?.text || "";

    if (!chatId) {
      return res.status(200).send("ok");
    }

    res.status(200).send("ok");

    if (userText.trim() === "/start") {
      await sendTelegramMessage(
        chatId,
        "Yo 👋 I'm RoastBot. Send me anything and I'll roast you, or type:\n\n" +
          "\"rizz me\" — for a pickup line\n" +
          "\"comeback for [something someone said]\" — for a clapback\n\n" +
          "Default: just talk to me and I'll roast you 💀"
      );
      return;
    }

    const replyText = await generateRoast(userText);
    await sendTelegramMessage(chatId, replyText);
  } catch (err) {
    console.error("Webhook error:", err?.message || err);
    if (!res.headersSent) res.status(200).send("ok");
  }
}

async function generateRoast(userText) {
  if (!GROQ_API_KEY) {
    console.error("Missing GROQ_API_KEY env var");
    return "My key don spoil, master needs to fix am 😅";
  }

  const systemPrompt = `You are a savage, funny Nigerian roast bot that texts in a mix of English and pidgin.
Rules:
- Keep replies under 3 sentences, punchy, chat-message length.
- Be funny and savage, never genuinely hurtful, no slurs, no real hate speech, no bullying based on identity.
- If the user asks for a "rizz line" or "rizz me", give them a cheesy/funny pickup line instead of a roast.
- If the user asks for a "comeback", give them a witty comeback to use on someone.
- Default to a roast if the intent is unclear.
- Use Nigerian slang naturally (abeg, wahala, jare, na you, etc) but keep it readable.`;

  const body = JSON.stringify({
    model: "openai/gpt-oss-20b",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText || "roast me" },
    ],
    max_tokens: 200,
    temperature: 1.0,
  });

  // Try up to 2 times — Vercel's serverless functions occasionally hit a
  // cold-start network blip on the first outbound fetch, a retry fixes it.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Groq error:", JSON.stringify(data));
        return "My brain don hang small, try again abeg 😅";
      }

      const text = data.choices?.[0]?.message?.content?.trim();
      return text || "Network dey do wahala, try again.";
    } catch (err) {
      console.error(`Groq fetch failed (attempt ${attempt}):`, err?.message || err);
      if (attempt === 2) {
        return "Groq no dey respond, try again in small time.";
      }
      // small pause before retrying
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN env var");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error("Telegram send error:", JSON.stringify(data));
    }
    return data;
  } catch (err) {
    console.error("Telegram fetch failed:", err?.message || err);
  }
}
