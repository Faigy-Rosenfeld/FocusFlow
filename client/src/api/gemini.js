const API_URL = import.meta.env.VITE_API_URL;

const fetchTranscript = async (videoId) => {
  try {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=json3`
    );
    if (!res.ok) return null;
    const data = await res.json();
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

export const fetchQuestions = async (videoId, title) => {
  const transcript = await fetchTranscript(videoId);

  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/gemini/questions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ video_id: videoId, title, transcript }),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) return [];
  return res.json();
};

export const getQuestionForPosition = (questions, position) => {
  if (!questions?.length) return null;
  const MAX_DISTANCE = 60;
  const nearby = questions.filter(q => Math.abs(q.time - position) <= MAX_DISTANCE);
  if (!nearby.length) return null;
  return nearby.reduce((closest, q) =>
    Math.abs(q.time - position) < Math.abs(closest.time - position) ? q : closest
  );
};
