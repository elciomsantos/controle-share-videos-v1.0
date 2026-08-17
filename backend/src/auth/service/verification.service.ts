import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import argon from "argon2";
import dayjs from "dayjs";
import { I18nService } from "nestjs-i18n";
import { ARGON2_OPTIONS } from "../../constants";
import { AuditEvent, AuditService } from "../../audit/audit.service";
import { EmailService } from "../../email/email.service";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * VerificationService — verificação de contas (e-mail/TOTP de ativação) e
 * recuperação de senha (reset). Isolado do fluxo de tokens de sessão.
 */
@Injectable()
export class VerificationService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private readonly i18n: I18nService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

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

  /**
   * SEC-06: resposta idêntica para e-mail desconhecido ou já ativado para não
   * servir como oráculo de enumeração de contas. Um novo token só é enviado a
   * usuários pendentes.
   */
  async resendVerification(emailInput: string) {
    const email = emailInput.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.isActivated) return;

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

      void this.auditService?.record(AuditEvent.PASSWORD_RESET_REQUESTED, {
        userId: user.id,
        result: "success",
      });
      await this.emailService.sendResetPasswordEmail(user.email, token);
    });
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: { resetPasswordToken: { token } },
      include: { resetPasswordToken: true },
    });

    if (!user)
      throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));

    // SEC-03/BKD-01: enforce the token TTL on redemption, not only on cleanup
    // jobs — a leaked token must not be usable beyond expiresAt.
    if (dayjs().isAfter(user.resetPasswordToken?.expiresAt)) {
      await this.prisma.resetPasswordToken.delete({
        where: { token },
      });
      throw new BadRequestException(this.i18n.t("auth.tokenInvalidOrExpired"));
    }

    const newPasswordHash = await argon.hash(newPassword, ARGON2_OPTIONS);

    await this.prisma.$transaction(async (tx) => {
      await tx.resetPasswordToken.delete({
        where: { token },
      });

      // SEC-1.2/16.4: alteração de credenciais revoga todas as sessões do
      // usuário (refresh tokens) — qualquer sessão anterior deixa de valer.
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });

      await tx.user.update({
        where: { id: user.id },
        data: { password: newPasswordHash },
      });
    });

    void this.auditService?.record(AuditEvent.PASSWORD_RESET_COMPLETED, {
      userId: user.id,
      result: "success",
    });
    void this.auditService?.record(AuditEvent.SESSION_REVOKED, {
      userId: user.id,
      resource: "all",
      result: "success",
    });
  }
}
