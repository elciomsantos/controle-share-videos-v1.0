import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import configService from "./services/config.service";
import { getDefaultConfig } from "./utils/defaultConfig.util";

export const config = {
  matcher: "/((?!api|static|.*\\..*|_next).*)",
};

async function fetchConfig(apiUrl: string): Promise<any> {
  try {
    const response = await fetch(`${apiUrl}/api/configs`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(1000),
    });

    if (!response.ok) {
      throw new Error(`Config fetch failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Config fetch failed, using defaults:", error);
    return getDefaultConfig();
  }
}

function getJwtSecret(): string {
  // Prefer file-based secret (Docker secret)
  const secretFile = process.env.JWT_SECRET_FILE;
  if (secretFile && fs.existsSync(secretFile)) {
    return fs.readFileSync(secretFile, "utf8").trim();
  }
  // Fallback to environment variable
  const secretEnv = process.env.JWT_SECRET;
  if (secretEnv) {
    return secretEnv;
  }
  // Last resort: empty string (will cause verification to fail)
  return "";
}

async function verifyJwt(token: string, secret: string): Promise<{ role: string; isAdmin: boolean } | null> {
  if (!secret) {
    console.warn("JWT_SECRET not configured, skipping token verification");
    return null;
  }
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey);
    return {
      role: payload.role as string,
      isAdmin: payload.isAdmin === true,
    };
  } catch {
    return null;
  }
}

/**
 * SEC-NEW-4: verificação delegada ao backend quando o fast-path local falha
 * (ex.: após rotação híbrida, o segredo ativo é o DB, não mais o JWT_SECRET_FILE).
 * O backend resolve o segredo exato por kid e rejeita tokens inválidos, então
 * nada de novo é exposto além do que o guard de autenticação já faz.
 */
async function verifyJwtViaBackend(
  token: string,
  apiUrl: string,
): Promise<{ role: string; isAdmin: boolean } | null> {
  try {
    const response = await fetch(`${apiUrl}/api/users/me`, {
      headers: {
        Cookie: `__Host-SID=${token}; access_token=${token}`,
      },
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const user = (await response.json()) as {
      role?: string;
      isAdmin?: boolean;
    };
    if (!user || !user.role) return null;
    return { role: user.role, isAdmin: user.isAdmin === true };
  } catch (error) {
    console.error("Backend JWT verification failed:", error);
    return null;
  }
}

export default async function proxy(request: NextRequest) {
  const routes = {
    unauthenticated: new Routes(["/auth/*", "/"]),
    public: new Routes([
      "/share/*",
      "/s/*",
      "/upload/*",
      "/error",
      "/imprint",
      "/privacy",
    ]),
    admin: new Routes(["/admin*"]),
    account: new Routes(["/account*"]),
    disabled: new Routes([]),
  };

  const apiUrl = process.env.API_URL || "http://localhost:8080";
  const config = await fetchConfig(apiUrl);

  const getConfig = <K extends string>(key: K) => {
    return configService.get(key, config);
  };

  const route = request.nextUrl.pathname;
  let user: { role: string; isAdmin: boolean } | null = null;
  const accessToken =
    request.cookies.get("__Host-SID")?.value ??
    request.cookies.get("access_token")?.value;

  const jwtSecret = getJwtSecret();
  if (accessToken && jwtSecret) {
    // SEC-NEW-4: fast-path local primeiro; se falhar (ex.: rotação do segredo
    // no backend), delega a verificação ao backend, que resolve por kid.
    user = await verifyJwt(accessToken, jwtSecret);
    if (!user) {
      user = await verifyJwtViaBackend(accessToken, apiUrl);
    }
  } else if (accessToken) {
    user = await verifyJwtViaBackend(accessToken, apiUrl);
  }

  if (!getConfig("share.allowRegistration")) {
    routes.disabled.routes.push("/auth/signUp");
  }

  if (!getConfig("smtp.enabled")) {
    routes.disabled.routes.push("/auth/resetPassword*");
  }

  if (!getConfig("legal.enabled")) {
    routes.disabled.routes.push("/imprint", "/privacy");
  } else {
    if (!getConfig("legal.imprintText") && !getConfig("legal.imprintUrl")) {
      routes.disabled.routes.push("/imprint");
    }
    if (
      !getConfig("legal.privacyPolicyText") &&
      !getConfig("legal.privacyPolicyUrl")
    ) {
      routes.disabled.routes.push("/privacy");
    }
  }

  const rules = [
    {
      condition: routes.disabled.contains(route),
      path: "/",
    },
    {
      condition: user && routes.unauthenticated.contains(route),
      path: "/upload",
    },
    {
      condition: !user && !routes.public.contains(route) && !routes.unauthenticated.contains(route),
      path: "/auth/signIn",
    },
    {
      condition: !user && routes.account.contains(route),
      path: "/upload",
    },
    {
      condition:
        user &&
        (route.startsWith("/admin/users") ||
          route.startsWith("/admin/config")) &&
        user?.role !== "admin" &&
        user?.isAdmin !== true,
      path: "/upload",
    },
    {
      condition: routes.admin.contains(route) && user?.role !== "admin" && user?.role !== "auditor" && user?.isAdmin !== true,
      path: "/upload",
    },
    {
      condition: (!getConfig("general.showHomePage") || user) && route == "/",
      path: "/upload",
    },
    {
      condition: route == "/imprint" && !getConfig("legal.imprintText") && getConfig("legal.imprintUrl"),
      path: getConfig("legal.imprintUrl"),
    },
    {
      condition: route == "/privacy" && !getConfig("legal.privacyPolicyText") && getConfig("legal.privacyPolicyUrl"),
      path: getConfig("legal.privacyPolicyUrl"),
    },
  ];
  for (const rule of rules) {
    if (rule.condition) {
      let { path } = rule;

      if (path == "/auth/signIn") {
        path = path + "?redirect=" + encodeURIComponent(route);
      }
      const response = NextResponse.redirect(new URL(path, request.url));
      response.headers.set("Vary", "x-nextjs-data");
      return response;
    }
  }
}

class Routes {
  constructor(public routes: string[]) {}

  contains(_route: string) {
    for (const route of this.routes) {
      if (new RegExp("^" + route.replace(/\*/g, ".*") + "$").test(_route))
        return true;
    }
    return false;
  }
}
