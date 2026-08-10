import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);
const CSRF_HEADER = "X-CSRF-Token";

let csrfToken: string | null = null;
let csrfFetchPromise: Promise<string> | null = null;

const fetchCsrfToken = async (): Promise<string> => {
  if (csrfToken) return csrfToken;
  if (csrfFetchPromise) return csrfFetchPromise;
  csrfFetchPromise = axios
    .get("/api/auth/csrf-token")
    .then((res) => {
      csrfToken = (res.data?.token as string) ?? null;
      csrfFetchPromise = null;
      return csrfToken ?? "";
    })
    .catch((e) => {
      csrfFetchPromise = null;
      // Re-throw so callers can handle; it means backend/csrf endpoint down
      throw e;
    });
  return csrfFetchPromise;
};

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// Attach CSRF token to mutating requests.
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (MUTATING_METHODS.has(config.method?.toLowerCase() ?? "")) {
      try {
        const token = await fetchCsrfToken();
        if (token) config.headers[CSRF_HEADER] = token;
      } catch {
        // If CSRF token cannot be fetched, allow the request to proceed; the
        // backend will reject with 403 (csrf_invalid). This avoids blocking
        // safe requests when the cookie hasn't been issued yet.
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// On 401 from an authenticated endpoint, refresh the access token once and
// retry the original request. Needed because `access_token` is httpOnly, so the
// client cannot read its `exp` and the proactive refresh in _app never fires —
// without this, every session dies silently after the 15-minute token lifetime.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & {
          _csrfRetried?: boolean;
          _authRetried?: boolean;
        })
      | undefined;
    const status = error.response?.status;
    const failedUrl = (original?.url ?? "").replace(/^\//, "");
    const isAuthRoute = /^auth\//.test(failedUrl);

    if (
      status === 401 &&
      !isAuthRoute &&
      original &&
      !original._authRetried
    ) {
      original._authRetried = true;
      try {
        await api.post("/auth/token");
        return api.request(original);
      } catch {
        // Refresh failed; fall through and reject with the original error.
      }
    }

    if (
      error.response?.status === 403 &&
      (error.response.data as { message?: string } | undefined)?.message ===
        "csrf_invalid" &&
      original &&
      MUTATING_METHODS.has(original.method?.toLowerCase() ?? "") &&
      !original._csrfRetried
    ) {
      original._csrfRetried = true;
      csrfToken = null;
      csrfFetchPromise = null;
      try {
        const token = await fetchCsrfToken();
        original.headers![CSRF_HEADER] = token;
        return api.request(original);
      } catch {
        return Promise.reject(error);
      }
    }

    if (
      error.response?.status === 403 &&
      (error.response?.data as { message?: string } | undefined)?.message === "auth.passwordMustChange"
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
