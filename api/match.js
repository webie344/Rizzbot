// api/match.js
// Runs weekly via Vercel Cron (configured in vercel.json).
// Pairs up all users who are complete and not yet matched this cycle,
// generates an AI icebreaker for each pair, and DMs both people.
//
// Protected by a secret so randoms on the internet can't trigger it —
// Vercel Cron sends this automatically, you don't need to do anything
// extra once CRON_SECRET is set as an env var.

import { getFirestore } from "./_firebase.js";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
  // Vercel Cron sends this header automatically when it triggers the job.
  const authHeader = req.headers["authorization"];
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const db = getFirestore();
    const snapshot = await db
      .collection("matchbot_users")
      .where("complete", "==", true)
      .get();

    let pool = [];
    snapshot.forEach((doc) => pool.push({ id: doc.id, ...doc.data() }));

    if (pool.length < 2) {
      return res.status(200).json({ message: "Not enough users to match yet", count: pool.length });
    }

    // Shuffle the pool so pairing isn't predictable/repetitive week to week
    pool = shuffle(pool);

    const pairs = [];
    while (pool.length >= 2) {
      pairs.push([pool.pop(), pool.pop()]);
    }
    // If there's an odd one out, they just sit out this week — no match, no message.

    const results = [];
    for (const [userA, userB] of pairs) {
      const icebreaker = await generateIcebreaker(userA, userB);
      await notifyMatch(userA, userB, icebreaker);
      await notifyMatch(userB, userA, icebreaker);

      const db2 = getFirestore();
      const now = new Date().toISOString();
      await db2.collection("matchbot_users").doc(userA.id).update({ matchedWith: userB.id, lastMatchAt: now });
      await db2.collection("matchbot_users").doc(userB.id).update({ matchedWith: userA.id, lastMatchAt: now });

      results.push({ pair: [userA.firstName, userB.firstName] });
    }

    return res.status(200).json({ matched: results.length, pairs: results });
  } catch (err) {
    console.error("Match job error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "unknown error" });
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function generateIcebreaker(userA, userB) {
  const fallback = "You two got matched — start by asking about each other's interests above 👀";

  if (!GROQ_API_KEY) return fallback;

  const prompt = `Two strangers just got matched on a friend-matching bot. Write ONE short, fun icebreaker question (under 25 words) that connects something specific from both of their profiles below. Be casual and playful, use light Nigerian slang if it fits naturally. Only output the icebreaker line, nothing else.

Person A — interests: ${userA.answers?.interests || "unknown"}, looking for: ${userA.answers?.lookingFor || "unknown"}, fun fact: ${userA.answers?.funFact || "unknown"}

Person B — interests: ${userB.answers?.interests || "unknown"}, looking for: ${userB.answers?.lookingFor || "unknown"}, fun fact: ${userB.answers?.funFact || "unknown"}`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 100,
        temperature: 0.9,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Groq error:", JSON.stringify(data));
      return fallback;
    }
    return data.choices?.[0]?.message?.content?.trim() || fallback;
  } catch (err) {
    console.error("Groq fetch failed:", err?.message || err);
    return fallback;
  }
}

async function notifyMatch(user, matchedWith, icebreaker) {
  const contactLine = matchedWith.username
    ? `Say hi: @${matchedWith.username}`
    : `They don't have a public username set, so wait for them to message you here, or ask the bot to relay (relay not built yet — for now, ask them to DM you first).`;

  const text =
    `🎉 You've been matched with ${matchedWith.firstName}!\n\n` +
    `Interests: ${matchedWith.answers?.interests || "n/a"}\n` +
    `Fun fact: ${matchedWith.answers?.funFact || "n/a"}\n\n` +
    `Icebreaker: ${icebreaker}\n\n` +
    contactLine;

  await sendTelegramMessage(user.chatId, text);
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
