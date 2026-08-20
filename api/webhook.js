// api/webhook.js
// Handles the onboarding conversation: asks each user a few questions,
// saves their answers to Firestore. Matching itself happens separately,
// in api/match.js, run weekly by a Vercel Cron job.

import { getFirestore } from "./_firebase.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// The onboarding questions, asked one at a time, in order.
const QUESTIONS = [
  { key: "interests", text: "What are you into? (e.g. anime, football, music, gaming, books — just list a few)" },
  { key: "lookingFor", text: "What are you hoping to get out of this? (e.g. new friend, study partner, just someone to talk to)" },
  { key: "funFact", text: "One random fun fact about you, so your match has something to open with 👀" },
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Match bot is alive");
  }

  try {
    const message = req.body?.message;
    const chatId = message?.chat?.id;
    const userText = (message?.text || "").trim();
    const username = message?.from?.username || null;
    const firstName = message?.from?.first_name || "there";

    if (!chatId) {
      return res.status(200).send("ok");
    }

    const db = getFirestore();
    const userRef = db.collection("matchbot_users").doc(String(chatId));
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : null;

    // Restart flow
    if (userText === "/start") {
      await userRef.set({
        chatId,
        username,
        firstName,
        step: 0,
        answers: {},
        complete: false,
        matchedWith: null,
        lastMatchAt: null,
      });
      await sendTelegramMessage(
        chatId,
        `Yo ${firstName} 👋 I match you with someone new every week based on shared interests. Quick setup, 3 questions.\n\n${QUESTIONS[0].text}`
      );
      return res.status(200).send("ok");
    }

    // No profile yet and they didn't send /start
    if (!userData) {
      await sendTelegramMessage(chatId, "Send /start to get set up first 🙂");
      return res.status(200).send("ok");
    }

    // Still going through onboarding questions
    if (!userData.complete) {
      const step = userData.step || 0;
      const currentQuestion = QUESTIONS[step];

      const updatedAnswers = {
        ...userData.answers,
        [currentQuestion.key]: userText,
      };

      const nextStep = step + 1;

      if (nextStep < QUESTIONS.length) {
        await userRef.update({ step: nextStep, answers: updatedAnswers });
        await sendTelegramMessage(chatId, QUESTIONS[nextStep].text);
      } else {
        await userRef.update({ step: nextStep, answers: updatedAnswers, complete: true });
        await sendTelegramMessage(
          chatId,
          "You're all set ✅ You'll get matched with someone new soon. I'll message you here when it happens — just sit tight."
        );
      }
      return res.status(200).send("ok");
    }

    // Already onboarded, chatting normally
    await sendTelegramMessage(
      chatId,
      "You're already in the matching pool. Sit tight for your next match, or send /start to redo your answers."
    );
    return res.status(200).send("ok");
  } catch (err) {
    console.error("Webhook error:", err?.message || err);
    if (!res.headersSent) return res.status(200).send("ok");
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
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const data = await response.json();
    if (!data.ok) console.error("Telegram send error:", JSON.stringify(data));
    return data;
  } catch (err) {
    console.error("Telegram fetch failed:", err?.message || err);
  }
}
