import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { I18nService } from "nestjs-i18n";

@Injectable()
export class PasswordMustChangeGuard implements CanActivate {
  private readonly whitelistedPaths = [
    "/api/auth/password",
    "/api/users/me",
    "/api/auth/logout",
    "/api/auth/token",
  ];

  constructor(
    private reflector: Reflector,
    private i18n: I18nService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.passwordMustChange !== true) {
      return true;
    }

    const path = request.route?.path || request.url;
    const method = request.method;

    const isWhitelisted = this.whitelistedPaths.some(
      (whitelisted) =>
        path === whitelisted ||
        (method === "PATCH" && path.startsWith("/api/auth/password")) ||
        (method === "GET" && path === "/api/users/me") ||
        (method === "POST" && path === "/api/auth/logout") ||
        (method === "POST" && path === "/api/auth/token"),
    );

    if (isWhitelisted) {
      return true;
    }

    throw new ForbiddenException(
      this.i18n.t("auth.passwordMustChange"),
    );
  }
}