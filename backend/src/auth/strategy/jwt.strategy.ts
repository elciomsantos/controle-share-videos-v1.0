import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { Strategy } from "passport-jwt";
import { JwtSecretService } from "../../config/jwt-secret.service";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    jwtSecret: JwtSecretService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: JwtStrategy.extractJWT,
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

  private static extractJWT(req: Request) {
    if (!req.cookies.access_token) return null;
    return req.cookies.access_token;
  }

  async validate(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) return null;
    return user;
  }
}

