import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { RequestContextLogger } from "../../common/request-context/request-context";
import { User } from "../../../prisma/generated/prisma/client";
import argon from "argon2";
import { I18nService } from "nestjs-i18n";
import { PrismaService } from "../../prisma/prisma.service";
import { TokenService } from "./token.service";
import { AuthSignInDTO } from "../dto/authSignIn.dto";

/**
 * LoginService — verificação de credenciais e emissão da sessão inicial.
 * Testável isoladamente com mock de Prisma (não depende de mais nenhum service
 * além do TokenService para emitir a sessão).
 */
@Injectable()
export class LoginService {
  constructor(
    private prisma: PrismaService,
    private tokenService: TokenService,
    private readonly i18n: I18nService,
  ) {}
  private readonly logger = new RequestContextLogger(LoginService.name);

  async signIn(dto: AuthSignInDTO, ip: string) {
    if (!dto.email && !dto.username) {
      throw new BadRequestException(
        this.i18n.t("auth.emailOrUsernameRequired"),
      );
    }

    const email = dto.email?.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username: dto.username }],
      },
    });

    if (user?.password && (await argon.verify(user.password, dto.password))) {
      if (!user.isActivated) {
        // SEC-1.2/14.4: mensagem genérica — não revelar que a conta existe.
        this.logger.debug(
          `Login denied for inactive user ${user.email} from IP ${ip}`,
        );
        throw new UnauthorizedException(this.i18n.t("auth.wrongCredentials"));
      }
      this.logger.log(
        `Successful password login for user ${user.email} from IP ${ip}`,
      );
      return this.generateToken(user);
    }

    this.logger.debug(
      `Failed login attempt for user ${dto.email || dto.username} from IP ${ip}`,
    );
    throw new UnauthorizedException(this.i18n.t("auth.wrongCredentials"));
  }

  /**
   * Emite a sessão inicial para um usuário já autenticado (credencial validada
   * previamente). Se o usuário tiver TOTP habilitado, retorna apenas um login
   * token para o segundo fator.
   *
   * SEC-1.2/14.6 (§34.2): contas administrativas são obrigadas a ter MFA
   * verificado. Admin sem TOTP recebe apenas um login token com a flag
   * `requiresTotpSetup`, direcionando ao cadastro pré-login — nenhuma sessão
   * (access/refresh) é emitida antes do segundo fator estar ativo.
   */
  async generateToken(user: User) {
    if (user.totpVerified) {
      const loginToken = await this.tokenService.createLoginToken(user.id);
      return { loginToken };
    }

    if (user.isAdmin) {
      const loginToken = await this.tokenService.createLoginToken(user.id);
      return { loginToken, requiresTotpSetup: true };
    }

    const refreshToken = await this.tokenService.createRefreshToken(
      user.id,
      undefined,
      new Date(),
    );
    const accessToken = this.tokenService.signAccessToken(
      user,
      refreshToken.id,
    );

    return { accessToken, refreshToken: refreshToken.token };
  }

  /**
   * Verifica a senha de um usuário contra o hash argon2 armazenado.
   */
  async verifyPassword(user: User, password: string) {
    if (!user.password) return false;
    return argon.verify(user.password, password);
  }
}
