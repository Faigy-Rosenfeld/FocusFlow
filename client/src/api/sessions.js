import api from "./client";

export const createSession = (content_id) => api.post("/api/sessions", { content_id });
export const addReading = (session_id, position, score) =>
  api.post(`/api/sessions/${session_id}/readings`, { position, score });
export const endSession = (session_id) => api.post(`/api/sessions/${session_id}/end`);
export const listSessions = () => api.get("/api/sessions");
export const getSession = (session_id) => api.get(`/api/sessions/${session_id}`);
