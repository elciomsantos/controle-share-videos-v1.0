import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
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
import { AuditEvent, AuditService } from "../audit/audit.service";
import { ConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";
import { LoginService } from "./service/login.service";
import { TokenService } from "./service/token.service";
import { RecoveryCodeService } from "./recovery-code.service";
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
    private recoveryCodeService: RecoveryCodeService,
    private readonly i18n: I18nService,
    @Optional() private readonly auditService?: AuditService,
  ) {}
  private readonly logger = new RequestContextLogger(AuthTotpService.name);

  /** Helper: best-effort client IP from the request context. */
  private clientIp(): string {
    return getRequestContext()?.ip ?? "unknown";
  }

  /** Valida um login token não usado e não expirado, retornando-o com o usuário. */
  private async validateLoginToken(loginToken: string) {
    const token = await this.prisma.loginToken.findFirst({
      where: { token: loginToken },
      include: { user: true },
    });

    if (!token || token.used)
      throw new UnauthorizedException(this.i18n.t("auth.invalidLoginToken"));

    if (token.expiresAt < new Date())
      throw new UnauthorizedException(
        this.i18n.t("auth.loginTokenExpired"),
        "token_expired",
      );

    return token;
  }

  private async consumeLoginToken(loginToken: string) {
    await this.prisma.loginToken.update({
      where: { token: loginToken },
      data: { used: true },
    });
  }

  private async issueSession(user: User) {
    // SEC-1.2/15.4: login com segundo fator (ou reautenticação) marca a
    // sessão como autenticada recentemente.
    const refreshToken = await this.tokenService.createRefreshToken(
      user.id,
      undefined,
      new Date(),
    );
    const { accessToken } = await this.tokenService.createSession(
      user.id,
      refreshToken.id,
    );
    return { accessToken, refreshToken: refreshToken.token };
  }

  async signInTotp(dto: AuthSignInTotpDTO) {
    const token = await this.validateLoginToken(dto.loginToken);
    const user = token.user;

    if (!user.totpSecret) {
      throw new BadRequestException(this.i18n.t("auth.totpNotEnabled"));
    }

    const verified = await verify({
      token: dto.totp,
      secret: user.totpSecret,
      guardrails: legacyGuardrails,
    });

    if (!verified.valid) {
      // SEC-1.2/15.3: aceita recovery code de uso único como alternativa.
      const consumed = await this.recoveryCodeService.consume(user.id, dto.totp);
      if (!consumed) {
        void this.auditService?.record(AuditEvent.MFA_FAILED, {
          userId: user.id,
          result: "invalid_code",
        });
        this.logger.debug(
          `TOTP sign-in failure for user ${user.email} from IP ${this.clientIp()} (invalid code)`,
        );
        throw new BadRequestException(this.i18n.t("auth.invalidCode"));
      }
    }

    await this.consumeLoginToken(token.token);
    const session = await this.issueSession(user);

    void this.auditService?.record(AuditEvent.LOGIN_SUCCESS, {
      userId: user.id,
      result: "success",
    });
    this.logger.log(`TOTP sign-in success for user ${user.email} from IP ${this.clientIp()}`);
    return session;
  }

  /**
   * SEC-1.2/14.6 — Cadastro de TOTP pré-login (contas administrativas).
   * Exige login token válido (senha já conferida no signIn) + nova confirmação
   * da senha. Reutiliza o segredo em andamento, se existir.
   */
  async enrollTotp(loginToken: string, password: string) {
    const token = await this.validateLoginToken(loginToken);
    const user = token.user;

    if (!(await this.loginService.verifyPassword(user, password)))
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    if (user.totpVerified) {
      throw new BadRequestException(this.i18n.t("auth.totpAlreadyEnabled"));
    }

    let secret = user.totpSecret;
    if (!secret) {
      secret = generateSecret();
      await this.prisma.user.update({
        where: { id: user.id },
        data: { totpEnabled: true, totpSecret: secret },
      });
    }

    const issuer = this.configService.getString("general.appName");
    const otpURL = generateURI({
      issuer,
      label: user.username || user.email,
      secret,
    });

    const qrCode = new qrcode({
      content: otpURL,
      container: "svg-viewbox",
      join: true,
    }).svg();

    this.logger.log(`TOTP enroll started for user ${user.email} from IP ${this.clientIp()}`);
    return {
      totpAuthUrl: otpURL,
      totpSecret: secret,
      qrCode: "data:image/svg+xml;base64," + Buffer.from(qrCode).toString("base64"),
    };
  }

  /**
   * SEC-1.2/14.6 — Conclui o cadastro de TOTP pré-login: valida o código,
   * marca o segundo fator como verificado, gera os recovery codes (exibidos
   * uma única vez) e emite a sessão.
   */
  async enrollVerifyTotp(loginToken: string, code: string) {
    const token = await this.validateLoginToken(loginToken);
    const user = token.user;

    if (!user.totpSecret) {
      throw new BadRequestException(this.i18n.t("auth.totpNotInProgress"));
    }

    const verified = await verify({
      token: code,
      secret: user.totpSecret,
      guardrails: legacyGuardrails,
    });

    if (!verified.valid) {
      throw new BadRequestException(this.i18n.t("auth.invalidCode"));
    }

    await this.consumeLoginToken(token.token);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpVerified: true },
    });

    const recoveryCodes = await this.recoveryCodeService.regenerate(user.id);
    const session = await this.issueSession(user);

    void this.auditService?.record(AuditEvent.MFA_ENABLED, {
      userId: user.id,
      result: "success",
    });
    this.logger.log(`TOTP enrolled and verified for user ${user.email} from IP ${this.clientIp()}`);
    return { ...session, recoveryCodes };
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

    // SEC-1.2/15.3: recovery codes são emitidos apenas na ativação, exibidos
    // uma única vez.
    const recoveryCodes = await this.recoveryCodeService.regenerate(user.id);

    void this.auditService?.record(AuditEvent.MFA_ENABLED, {
      userId: user.id,
      result: "success",
    });
    this.logger.log(`TOTP verified for user ${user.email} from IP ${this.clientIp()}`);
    return { verified: true, recoveryCodes };
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

    // SEC-1.2/15.3: revoga os recovery codes ao desabilitar o segundo fator.
    await this.recoveryCodeService.clearForUser(user.id);

    void this.auditService?.record(AuditEvent.MFA_DISABLED, {
      userId: user.id,
      result: "success",
    });
    this.logger.log(`TOTP disabled for user ${user.email} from IP ${this.clientIp()}`);
    return true;
  }

  /**
   * SEC-1.2/15.3 — Regenera os recovery codes após confirmação de senha + TOTP.
   * Os códigos anteriores são revogados e novos valores são exibidos uma vez.
   */
  async regenerateRecoveryCodes(user: User, password: string, code: string) {
    if (!(await this.loginService.verifyPassword(user, password)))
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const totpResult = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { totpSecret: true },
    });

    if (!totpResult?.totpSecret) {
      throw new BadRequestException(this.i18n.t("auth.totpNotEnabled"));
    }

    const verified = await verify({
      token: code,
      secret: totpResult.totpSecret,
      guardrails: legacyGuardrails,
    });

    if (!verified.valid) {
      throw new BadRequestException(this.i18n.t("auth.invalidCode"));
    }

    const recoveryCodes = await this.recoveryCodeService.regenerate(user.id);

    this.logger.log(`Recovery codes regenerated for user ${user.email} from IP ${this.clientIp()}`);
    return { recoveryCodes };
  }
}
