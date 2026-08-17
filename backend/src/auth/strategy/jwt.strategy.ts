import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { Strategy } from "passport-jwt";
import { JwtSecretService } from "../../config/jwt-secret.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ConfigService } from "../../config/config.service";
import { getSessionCookieName } from "../../utils/session-cookie.util";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    jwtSecret: JwtSecretService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    super({
      jwtFromRequest: (req: Request) => {
        if (!req.cookies) return null;
        const cookieName = getSessionCookieName(
          config.getBoolean("general.secureCookies"),
        );
        return req.cookies[cookieName] ?? req.cookies.access_token ?? null;
      },
      algorithms: ["HS256", "HS512"],
      secretOrKeyProvider: (
        _req: Request,
        rawJwtToken: string,
        done: (err: Error | null, secret?: string | Buffer) => void,
      ) => {
        try {
          // Resolve the exact secret that signed the token (kid-based), falling
          // back to the current secret for legacy tokens without a kid.
          const secret =
            jwtSecret.resolveSecretForToken(rawJwtToken) ??
            jwtSecret.getCurrentSecret();
          done(null, secret);
        } catch (err) {
          done(err as Error);
        }
      },
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    // SEC: usuário desativado ou inexistente nunca deve ser autenticado.
    if (!user || !user.isActivated) return null;
    return user;
  }
}

