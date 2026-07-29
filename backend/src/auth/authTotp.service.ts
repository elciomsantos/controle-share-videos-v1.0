import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { User } from "../../prisma/generated/prisma/client";
import {
  generateSecret,
  generateURI,
  generate,
  verify,
  createGuardrails,
} from "otplib";
import qrcode from "qrcode-svg";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import { AuthSignInTotpDTO } from "./dto/authSignInTotp.dto";

const legacyGuardrails = createGuardrails({
  MIN_SECRET_BYTES: 10,
});

@Injectable()
export class AuthTotpService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private authService: AuthService,
    private readonly i18n: I18nService,
  ) {}
  private readonly logger = new Logger(AuthTotpService.name);

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
      throw new BadRequestException(this.i18n.t("auth.invalidCode"));
    }

    await this.prisma.loginToken.update({
      where: { token: token.token },
      data: { used: true },
    });

    const { refreshToken, refreshTokenId } =
      await this.authService.createRefreshToken(token.user.id);
    const accessToken = await this.authService.createAccessToken(
      token.user,
      refreshTokenId,
    );

    this.logger.log(`TOTP sign-in success for user ${token.user.email}`);
    return { accessToken, refreshToken };
  }

  async enableTotp(user: User, password: string) {
    if (!(await this.authService.verifyPassword(user, password)))
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const result = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { totpVerified: true },
    });

    if (result?.totpVerified) {
      throw new BadRequestException(this.i18n.t("auth.totpAlreadyEnabled"));
    }

    const issuer = this.configService.get("general.appName");
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

    this.logger.log(`TOTP enabled for user ${user.email}`);
    return {
      totpAuthUrl: otpURL,
      totpSecret: secret,
      qrCode:
        "data:image/svg+xml;base64," + Buffer.from(qrCode).toString("base64"),
    };
  }

  async verifyTotp(user: User, password: string, code: string) {
    if (!(await this.authService.verifyPassword(user, password)))
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const totpResult = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { totpSecret: true },
    });

    if (!totpResult?.totpSecret) {
      throw new BadRequestException(this.i18n.t("auth.totpNotInProgress"));
    }

    const expected = await generate({
      secret: totpResult.totpSecret,
      guardrails: legacyGuardrails,
    });

    if (code !== expected) {
      throw new BadRequestException(this.i18n.t("auth.invalidCode"));
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpVerified: true,
      },
    });

    this.logger.log(`TOTP verified for user ${user.email}`);
    return true;
  }

  async disableTotp(user: User, password: string, code: string) {
    if (!(await this.authService.verifyPassword(user, password)))
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const disableResult = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { totpSecret: true },
    });

    if (!disableResult?.totpSecret) {
      throw new BadRequestException(this.i18n.t("auth.totpNotEnabled"));
    }

    const expected = await generate({
      secret: disableResult.totpSecret,
      guardrails: legacyGuardrails,
    });

    if (code !== expected) {
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

    this.logger.log(`TOTP disabled for user ${user.email}`);
    return true;
  }
}
