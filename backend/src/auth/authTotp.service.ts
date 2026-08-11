import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { RequestContextLogger } from "../common/request-context/request-context";
import { getRequestContext } from "../common/request-context/request-context";
import { User } from "../../prisma/generated/prisma/client";
import {
  generateSecret,
  generateURI,
  verify,
  createGuardrails,
} from "otplib";
import qrcode from "qrcode-svg";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";
import { LoginService } from "./service/login.service";
import { TokenService } from "./service/token.service";
import { AuthSignInTotpDTO } from "./dto/authSignInTotp.dto";

const legacyGuardrails = createGuardrails({
  MIN_SECRET_BYTES: 10,
});

@Injectable()
export class AuthTotpService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private loginService: LoginService,
    private tokenService: TokenService,
    private readonly i18n: I18nService,
  ) {}
  private readonly logger = new RequestContextLogger(AuthTotpService.name);

  /** Helper: best-effort client IP from the request context. */
  private clientIp(): string {
    return getRequestContext()?.ip ?? "unknown";
  }

  async signInTotp(dto: AuthSignInTotpDTO) {
    const token = await this.prisma.loginToken.findFirst({
      where: {
        token: dto.loginToken,
      },
      include: {
        user: true,
      },
    });

    if (!token || token.used)
      throw new UnauthorizedException(this.i18n.t("auth.invalidLoginToken"));

    if (token.expiresAt < new Date())
      throw new UnauthorizedException(
        this.i18n.t("auth.loginTokenExpired"),
        "token_expired",
      );

    const { totpSecret } = token.user;

    if (!totpSecret) {
      throw new BadRequestException(this.i18n.t("auth.totpNotEnabled"));
    }

    const verified = await verify({
      token: dto.totp,
      secret: totpSecret,
      guardrails: legacyGuardrails,
    });
    if (!verified.valid) {
      this.logger.debug(
        `TOTP sign-in failure for user ${token.user.email} from IP ${this.clientIp()} (invalid code)`,
      );
      throw new BadRequestException(this.i18n.t("auth.invalidCode"));
    }

    await this.prisma.loginToken.update({
      where: { token: token.token },
      data: { used: true },
    });

    const refreshToken = await this.tokenService.createRefreshToken(
      token.user.id,
    );
    const accessToken = this.tokenService.signAccessToken(
      token.user,
      refreshToken.id,
    );

    this.logger.log(`TOTP sign-in success for user ${token.user.email} from IP ${this.clientIp()}`);
    return { accessToken, refreshToken: refreshToken.token };
  }

  async enableTotp(user: User, password: string) {
    if (!(await this.loginService.verifyPassword(user, password)))
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const result = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { totpVerified: true },
    });

    if (result?.totpVerified) {
      throw new BadRequestException(this.i18n.t("auth.totpAlreadyEnabled"));
    }

    const issuer = this.configService.getString("general.appName");
    const secret = generateSecret();

    const otpURL = generateURI({
      issuer: issuer,
      label: user.username || user.email,
      secret: secret,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: true,
        totpSecret: secret,
      },
    });

    const qrCode = new qrcode({
      content: otpURL,
      container: "svg-viewbox",
      join: true,
    }).svg();

    this.logger.log(`TOTP enabled for user ${user.email} from IP ${this.clientIp()}`);
    return {
      totpAuthUrl: otpURL,
      totpSecret: secret,
      qrCode:
        "data:image/svg+xml;base64," + Buffer.from(qrCode).toString("base64"),
    };
  }

  async verifyTotp(user: User, password: string, code: string) {
    if (!(await this.loginService.verifyPassword(user, password)))
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const totpResult = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { totpSecret: true },
    });

    if (!totpResult?.totpSecret) {
      throw new BadRequestException(this.i18n.t("auth.totpNotInProgress"));
    }

    const verified = await verify({
      token: code,
      secret: totpResult.totpSecret,
      guardrails: legacyGuardrails,
    });

    if (!verified.valid) {
      throw new BadRequestException(this.i18n.t("auth.invalidCode"));
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpVerified: true,
      },
    });

    this.logger.log(`TOTP verified for user ${user.email} from IP ${this.clientIp()}`);
    return true;
  }

  async disableTotp(user: User, password: string, code: string) {
    if (!(await this.loginService.verifyPassword(user, password)))
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const disableResult = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { totpSecret: true },
    });

    if (!disableResult?.totpSecret) {
      throw new BadRequestException(this.i18n.t("auth.totpNotEnabled"));
    }

    const verified = await verify({
      token: code,
      secret: disableResult.totpSecret,
      guardrails: legacyGuardrails,
    });

    if (!verified.valid) {
      throw new BadRequestException(this.i18n.t("auth.invalidCode"));
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpVerified: false,
        totpEnabled: false,
        totpSecret: null,
      },
    });

    this.logger.log(`TOTP disabled for user ${user.email} from IP ${this.clientIp()}`);
    return true;
  }
}
