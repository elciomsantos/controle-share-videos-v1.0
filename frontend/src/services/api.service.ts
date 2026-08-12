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

// Dedup global de refresh do access token.
//
// O `refresh_token` é de uso único (rotação + detecção de reuso SEC-07). Se
// várias requisições recebem 401 ao mesmo tempo (ex.: vários `refreshUser()`
// disparados por páginas/componentes em paralelo), cada uma delas chamava
// `/auth/token` com o MESMO cookie de refresh — a primeira rotacionava o token
// e as demais, ao apresentar o token já consumido, acionavam a detecção de
// reuso que REVOGA todas as sessões do usuário. A partir daí tudo passa a
// retornar 401 até o usuário refazer login.
//
// A solução é compartilhar UMA promise de refresh: a primeira chamada inicia o
// refresh e as concorrentes apenas aguardam o mesmo resultado, reenviando a
// requisição original depois — com o novo `access_token` cookie já aplicado.
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      await api.post("/auth/token");
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

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
        // Refresh compartilhado: garante que apenas UMA chamada `/auth/token`
        // rode por vez, mesmo com vários 401 concorrentes (evita o reuso do
        // refresh token de uso único que revogaria a sessão toda).
        const refreshed = await refreshAccessToken();
        if (!refreshed) return Promise.reject(error);
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
      // Invalida apenas o token cacheado. NÃO zerar o csrfFetchPromise: se
      // outro 403 csrf_invalid concorrente já disparou um refetch, ele é
      // reaproveitado — o backend rotaciona o cookie CSRF a cada GET
      // /api/auth/csrf-token, então vários refetches em paralelo rotacionam o
      // cookie repetidamente e invalidam o token uns dos outros (flakiness em
      // rajcadas de mutating requests simultâneos).
      csrfToken = null;
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
