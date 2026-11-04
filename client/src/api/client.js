import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // נווט ל-login רק אם זה 401 ואנחנו לא בדף ה-auth עצמו
    if (err.response?.status === 401) {
      const isAuthRoute = window.location.pathname === "/login" ||
                          window.location.pathname === "/register";
      if (!isAuthRoute) {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
