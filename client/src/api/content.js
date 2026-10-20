import api from "./client";

export const listContent = () => api.get("/api/content");
export const getContent = (id) => api.get(`/api/content/${id}`);
export const createContent = (data) => api.post("/api/content", data);
export const deleteContent = (id) => api.delete(`/api/content/${id}`);
