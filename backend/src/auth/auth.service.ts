import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
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

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
    private readonly i18n: I18nService,
  ) {}
  private readonly logger = new Logger(AuthService.name);

  async signUp(
    dto: AuthRegisterDTO,
    ip: string,
    isAdmin?: boolean,
    skipVerification?: boolean,
  ) {
    const isFirstUser = (await this.prisma.user.count()) == 0;
    const enableEmailVerification = this.config.get(
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

        const { refreshToken, refreshTokenId } = await this.createRefreshToken(
          user.id,
          tx,
        );
        const accessToken = await this.createAccessToken(user, refreshTokenId);

        this.logger.log(`User ${user.email} signed up from IP ${ip}`);
        return { accessToken, refreshToken, user };
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code == "P2002"
      ) {
        const duplicatedField: string = (e.meta?.target as string[] | undefined)?.[0] ?? "field";
        throw new BadRequestException(
          this.i18n.t("auth.userAlreadyExists", {
            args: { field: duplicatedField },
          }),
        );
      }
      throw e;
    }
  }

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
        throw new UnauthorizedException(
          this.i18n.t("auth.accountNotActivated"),
        );
      }
      this.logger.log(
        `Successful password login for user ${user.email} from IP ${ip}`,
      );
      return this.generateToken(user);
    }

    this.logger.log(
      `Failed login attempt for user ${dto.email || dto.username} from IP ${ip}`,
    );
    throw new UnauthorizedException(this.i18n.t("auth.wrongCredentials"));
  }

  async generateToken(user: User) {
    // TODO: Make all old loginTokens invalid when a new one is created
    // Check if the user has TOTP enabled
    if (user.totpVerified) {
      const loginToken = await this.createLoginToken(user.id);

      return { loginToken };
    }

    const { refreshToken, refreshTokenId } = await this.createRefreshToken(
      user.id,
    );
    const accessToken = await this.createAccessToken(user, refreshTokenId);

    return { accessToken, refreshToken };
  }

  async requestResetPassword(emailInput: string) {
    const email = emailInput.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { resetPasswordToken: true },
    });

    if (!user) return;

    await this.prisma.$transaction(async (tx) => {
      // Delete old reset password token
      if (user.resetPasswordToken) {
        await tx.resetPasswordToken.delete({
          where: { token: user.resetPasswordToken.token },
        });
      }

      const { token } = await tx.resetPasswordToken.create({
        data: {
          expiresAt: dayjs().add(1, "hour").toDate(),
          user: { connect: { id: user.id } },
        },
      });

      await this.emailService.sendResetPasswordEmail(user.email, token);
    });
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: { resetPasswordToken: { token } },
    });

    if (!user)
      throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));

    const newPasswordHash = await argon.hash(newPassword, ARGON2_OPTIONS);

    await this.prisma.resetPasswordToken.delete({
      where: { token },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: newPasswordHash },
    });
  }

  async verifyAccount(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { activationToken: token },
    });

    if (
      !user ||
      (user.activationTokenExpiresAt &&
        user.activationTokenExpiresAt < new Date())
    ) {
      throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isActivated: true,
        activationToken: null,
        activationTokenExpiresAt: null,
      },
    });
  }

  async resendVerification(emailInput: string) {
    const email = emailInput.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) return;

    if (user.isActivated) {
      throw new BadRequestException(this.i18n.t("auth.userAlreadyActivated"));
    }

    const activationToken = crypto.randomUUID();
    const activationTokenExpiresAt = dayjs().add(1, "day").toDate();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          activationToken,
          activationTokenExpiresAt,
        },
      });

      await this.emailService.sendVerificationEmail(
        user.email,
        activationToken,
      );
    });
  }

  async updatePassword(user: User, newPassword: string, oldPassword?: string) {
    const isPasswordValid =
      !user.password || (await argon.verify(user.password, oldPassword ?? ""));

    if (!isPasswordValid)
      throw new ForbiddenException(this.i18n.t("auth.invalidPassword"));

    const hash = await argon.hash(newPassword, ARGON2_OPTIONS);

    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hash },
    });

    return this.createRefreshToken(user.id);
  }

  async createAccessToken(user: User, refreshTokenId: string) {
    return this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        isAdmin: user.isAdmin,
        refreshTokenId,
      },
      {
        expiresIn: "15min",
        secret: this.config.get("internal.jwtSecret"),
      },
    );
  }

  async signOut(accessToken: string) {
    const { refreshTokenId } =
      (this.jwtService.decode(accessToken) as {
        refreshTokenId: string;
      }) || {};

    if (refreshTokenId) {
      await this.prisma.refreshToken
        .delete({ where: { id: refreshTokenId } })
        .catch((e) => {
          // Ignore error if refresh token doesn't exist
          if (e.code != "P2025") throw e;
        });
    }
  }

  async refreshAccessToken(refreshToken: string) {
    const refreshTokenMetaData = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!refreshTokenMetaData || refreshTokenMetaData.expiresAt < new Date())
      throw new UnauthorizedException();

    // JWT rotation: delete old refresh token and create new one
    await this.prisma.refreshToken.delete({
      where: { id: refreshTokenMetaData.id },
    });

    const newRefreshToken = await this.createRefreshToken(
      refreshTokenMetaData.user.id,
    );

    const accessToken = await this.createAccessToken(
      refreshTokenMetaData.user,
      newRefreshToken.refreshTokenId,
    );

    return {
      accessToken,
      ...newRefreshToken,
    };
  }

  async createRefreshToken(
    userId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const prisma = tx || this.prisma;
    const sessionDuration = this.config.get("general.sessionDuration");
    const { id, token } = await prisma.refreshToken.create({
      data: {
        userId,
        expiresAt: dayjs()
          .add(sessionDuration.value, sessionDuration.unit)
          .toDate(),
      },
    });

    return { refreshTokenId: id, refreshToken: token };
  }

  async createLoginToken(userId: string) {
    const loginToken = (
      await this.prisma.loginToken.create({
        data: { userId, expiresAt: dayjs().add(5, "minutes").toDate() },
      })
    ).token;

    return loginToken;
  }

  addTokensToResponse(
    response: Response,
    refreshToken?: string,
    accessToken?: string,
  ) {
    const isSecure = this.config.get("general.secureCookies");
    if (accessToken)
      response.cookie("access_token", accessToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: isSecure,
        maxAge: 1000 * 60 * 60 * 24 * 30 * 3, // 3 months
      });
    if (refreshToken) {
      const now = dayjs();
      const sessionDuration = this.config.get("general.sessionDuration");
      const maxAge = dayjs(now)
        .add(sessionDuration.value, sessionDuration.unit)
        .diff(now);
      response.cookie("refresh_token", refreshToken, {
        path: "/api/auth/token",
        httpOnly: true,
        sameSite: "strict",
        secure: isSecure,
        maxAge,
      });
    }
  }

  /**
   * Returns the user id if the user is logged in, null otherwise
   */
  async getIdOfCurrentUser(request: Request): Promise<string | null> {
    if (!request.cookies.access_token) return null;
    try {
      const payload = await this.jwtService.verifyAsync(
        request.cookies.access_token,
        {
          secret: this.config.get("internal.jwtSecret"),
        },
      );
      return payload.sub;
    } catch {
      return null;
    }
  }

  async verifyPassword(user: User, password: string) {
    if (!user.password) return false;
    return argon.verify(user.password, password);
  }
}
