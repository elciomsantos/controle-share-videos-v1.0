import {
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { RequestContextLogger } from "../common/request-context/request-context";
import { DuplicatedFieldException } from "../common/duplicated-field.exception";
import { Prisma, User } from "../../prisma/generated/prisma/client";
import argon from "argon2";
import { Request, Response } from "express";
import dayjs from "dayjs";
import { I18nService } from "nestjs-i18n";
import { ARGON2_OPTIONS } from "../constants";
import { ConfigService } from "../config/config.service";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthRegisterDTO } from "./dto/authRegister.dto";
import { AuthSignInDTO } from "./dto/authSignIn.dto";
import { LoginService } from "./service/login.service";
import { TokenService } from "./service/token.service";
import { RefreshService } from "./service/refresh.service";
import { VerificationService } from "./service/verification.service";

/**
 * AuthService — orquestrador da autenticação. Delega credenciais, tokens,
 * sessões e verificação para serviços isolados (Login/Token/Refresh/
 * Verification). Mantém somente o registro (signUp) e troca de senha (que
 * combinam duas dessas responsabilidades).
 */
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private emailService: EmailService,
    private readonly i18n: I18nService,
    private readonly loginService: LoginService,
    private readonly tokenService: TokenService,
    private readonly refreshService: RefreshService,
    private readonly verificationService: VerificationService,
  ) {}
  private readonly logger = new RequestContextLogger(AuthService.name);

  async signUp(
    dto: AuthRegisterDTO,
    ip: string,
    isAdmin?: boolean,
    skipVerification?: boolean,
  ) {
    const isFirstUser = (await this.prisma.user.count()) == 0;
    const enableEmailVerification = this.config.getBoolean(
      "email.enableEmailVerification",
    );
    const email = dto.email.toLowerCase().trim();

    const hash = dto.password ? await argon.hash(dto.password, ARGON2_OPTIONS) : null;
    try {
      const needsVerification =
        !isFirstUser && !skipVerification && enableEmailVerification;

      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            username: dto.username,
            password: hash,
            isAdmin: isAdmin ?? isFirstUser,
            role: isAdmin ?? isFirstUser ? "admin" : "operador",
            isActivated: !needsVerification,
            activationToken: needsVerification ? crypto.randomUUID() : null,
            activationTokenExpiresAt: needsVerification
              ? dayjs().add(1, "day").toDate()
              : null,
          },
        });

        if (user.activationToken) {
          await this.emailService.sendVerificationEmail(
            user.email,
            user.activationToken,
          );
          return { verificationRequired: true };
        }

        const refreshToken = await this.tokenService.createRefreshToken(
          user.id,
          tx,
        );
        const accessToken = this.tokenService.signAccessToken(
          user,
          refreshToken.id,
        );

        this.logger.log(`User ${user.email} signed up from IP ${ip}`);
        return { accessToken, refreshToken: refreshToken.token, user };
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code == "P2002"
      ) {
        const rawField: string = (e.meta?.target as string[] | undefined)?.[0] ?? "field";
        const field: "username" | "email" = rawField === "email" ? "email" : "username";
        throw new DuplicatedFieldException(
          this.i18n.t("auth.userAlreadyExists", { args: { field } }),
          field,
        );
      }
      throw e;
    }
  }

  /** Delega ao LoginService (verificação de credenciais + sessão inicial). */
  async signIn(dto: AuthSignInDTO, ip: string) {
    return this.loginService.signIn(dto, ip);
  }

  /** Delega ao LoginService (emissão de sessão para usuário autenticado). */
  async generateToken(user: User) {
    return this.loginService.generateToken(user);
  }

  async requestResetPassword(email: string) {
    return this.verificationService.requestResetPassword(email);
  }

  async resetPassword(token: string, newPassword: string) {
    return this.verificationService.resetPassword(token, newPassword);
  }

  async verifyAccount(token: string) {
    return this.verificationService.verifyAccount(token);
  }

  async resendVerification(email: string) {
    return this.verificationService.resendVerification(email);
  }

  async updatePassword(user: User, newPassword: string, oldPassword?: string) {
    const isPasswordValid = await this.loginService.verifyPassword(
      user,
      oldPassword ?? "",
    );

    if (!isPasswordValid)
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const hash = await argon.hash(newPassword, ARGON2_OPTIONS);

    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hash, passwordMustChange: false },
    });

    this.logger.log(`Password changed for user ${user.email}`);
    const refreshToken = await this.tokenService.createRefreshToken(user.id);
    return { refreshTokenId: refreshToken.id, refreshToken: refreshToken.token };
  }

  /** Back-compat: delega emissão de access token ao TokenService. */
  async createAccessToken(user: User, refreshTokenId: string) {
    return this.tokenService.signAccessToken(user, refreshTokenId);
  }

  async signOut(accessToken: string) {
    return this.refreshService.signOut(accessToken);
  }

  async logoutAllDevices(userId: string) {
    return this.refreshService.logoutAllDevices(userId);
  }

  async refreshAccessToken(refreshToken: string) {
    return this.refreshService.refreshAccessToken(refreshToken);
  }

  /** Back-compat: delega criação de refresh token ao TokenService. */
  createRefreshToken(userId: string, tx?: Prisma.TransactionClient) {
    return this.tokenService.createRefreshToken(userId, tx);
  }

  /** Back-compat: delega criação de login token ao TokenService. */
  async createLoginToken(userId: string) {
    return this.tokenService.createLoginToken(userId);
  }

  /** Back-compat: delega escrita de cookies ao TokenService. */
  addTokensToResponse(
    response: Response,
    refreshToken?: string,
    accessToken?: string,
  ) {
    return this.tokenService.addTokensToResponse(
      response,
      refreshToken,
      accessToken,
    );
  }

  /** Back-compat: delega leitura do usuário corrente ao TokenService. */
  async getIdOfCurrentUser(request: Request): Promise<string | null> {
    return this.tokenService.getUserIdFromRequest(request);
  }

  /** Back-compat: delega verificação de senha ao LoginService. */
  async verifyPassword(user: User, password: string) {
    return this.loginService.verifyPassword(user, password);
  }
}
