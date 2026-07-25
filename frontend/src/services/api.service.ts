import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 403 &&
      error.response?.data?.message === "auth.passwordMustChange"
    ) {
      if (typeof window !== "undefined") {
        const next = window.location.pathname;
        const target = `/account/change-password?restricted=true&next=${encodeURIComponent(next)}`;
        if (!window.location.pathname.startsWith("/account/change-password")) {
          window.location.href = target;
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
