const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// fetch transcript via YouTube's timedtext API
const fetchTranscript = async (videoId) => {
  try {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=json3`
    );
    if (!res.ok) return null;
    const data = await res.json();
    // flatten to [{time, text}]
    return data.events
      ?.filter((e) => e.segs)
      .map((e) => ({
        time: Math.floor((e.tStartMs || 0) / 1000),
        text: e.segs.map((s) => s.utf8).join(""),
      })) ?? null;
  } catch {
    return null;
  }
};

// build prompt for Gemini
const buildPrompt = (title, transcript) => {
  const transcriptText = transcript
    ? transcript.map((t) => `[${t.time}s] ${t.text}`).join("\n")
    : `Video title: "${title}" (no transcript available, generate questions based on the title)`;

  return `You are a focus assistant. Based on the following video transcript, generate 8 multiple choice questions spread across different timestamps.

Transcript:
${transcriptText}

Return ONLY a valid JSON array, no markdown, no explanation:
[
  {
    "time": <seconds into video>,
    "question": "<question about content near that time>",
    "options": ["<A>", "<B>", "<C>", "<D>"],
    "correct": <0-3 index of correct answer>
  }
]`;
};

export const fetchQuestions = async (videoId, title) => {
  if (!GEMINI_API_KEY) return [];

  const transcript = await fetchTranscript(videoId);

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(title, transcript) }] }],
    }),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  try {
    return JSON.parse(raw);
  } catch {
    // try to extract JSON array from response
    const match = raw.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  }
};

// get the closest question to a given position
export const getQuestionForPosition = (questions, position) => {
  if (!questions?.length) return null;
  return questions.reduce((closest, q) =>
    Math.abs(q.time - position) < Math.abs(closest.time - position) ? q : closest
  );
};
