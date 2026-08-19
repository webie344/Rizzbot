// api/webhook.js
// Telegram sends every incoming message to this URL as a POST request.
// No verification handshake needed (unlike WhatsApp) — just set the webhook once and go.

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
      return res.status(200).send("ok"); // ignore non-message updates
    }

    // Respond to Telegram immediately, do the work after
    res.status(200).send("ok");

    // Handle /start separately with a friendly intro
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
    console.error("Webhook error:", err);
    if (!res.headersSent) res.status(200).send("ok");
  }
}

async function generateRoast(userText) {
  const systemPrompt = `You are a savage, funny Nigerian roast bot that texts in a mix of English and pidgin.
Rules:
- Keep replies under 3 sentences, punchy, chat-message length.
- Be funny and savage, never genuinely hurtful, no slurs, no real hate speech, no bullying based on identity.
- If the user asks for a "rizz line" or "rizz me", give them a cheesy/funny pickup line instead of a roast.
- If the user asks for a "comeback", give them a witty comeback to use on someone.
- Default to a roast if the intent is unclear.
- Use Nigerian slang naturally (abeg, wahala, jare, na you, etc) but keep it readable.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText || "roast me" },
      ],
      max_tokens: 150,
      temperature: 1.0,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Groq error:", data);
    return "My brain don hang small, try again abeg 😅";
  }

  return data.choices?.[0]?.message?.content?.trim() || "Network dey do wahala, try again.";
}

async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

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
    console.error("Telegram send error:", data);
  }
  return data;
}
