import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { User } from "../../prisma/generated/prisma/client";
import dayjs from "dayjs";
import type { PluginFunc } from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/pt-br";
import nodemailer from "nodemailer";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "../config/config.service";

dayjs.extend(relativeTime as PluginFunc);

@Injectable()
export class EmailService {
  constructor(
    private config: ConfigService,
    private readonly i18n: I18nService,
  ) { }
  private readonly logger = new Logger(EmailService.name);

  getTransporter() {
    if (!this.config.getBoolean("smtp.enabled"))
      throw new InternalServerErrorException(this.i18n.t("email.smtpDisabled"));

    const username = this.config.getString("smtp.username");
    const password = this.config.getString("smtp.password");

    return nodemailer.createTransport({
      host: this.config.getString("smtp.host"),
      port: this.config.getNumber("smtp.port"),
      secure: this.config.getNumber("smtp.port") == 465,
      auth:
        username || password ? { user: username, pass: password } : undefined,
      tls: {
        rejectUnauthorized: !this.config.getBoolean(
          "smtp.allowUnauthorizedCertificates",
        ),
      },
    });
  }

  private async sendMail(email: string, subject: string, text: string) {
      const isHtml = this.config.getBoolean("email.sendHtmlEmails");

      await this.getTransporter()
        .sendMail({
          from: `"${this.config.getString("general.appName")}" <${this.config.getString(
            "smtp.email",
          )}>`,
          to: email,
          subject: subject,
          [isHtml ? "html" : "text"]: text,
        })
        .catch((e) => {
          this.logger.error(e);
          throw new InternalServerErrorException(this.i18n.t("email.sendFailed"));
        });
  
  }

  async sendMailToShareRecipients(
    recipientEmail: string,
    recipientId: string,
    shareId: string,
    creator?: User,
    description?: string,
    expiration?: Date,
  ) {
    if (!this.config.getBoolean("email.enableShareEmailRecipients"))
      throw new InternalServerErrorException(
        this.i18n.t("email.emailServiceDisabled"),
      );

    const shareUrl = `${this.config.getString(
      "general.appUrl",
    )}/s/${shareId}?recipient=${encodeURIComponent(recipientId)}`;
    const lang = this.config.getString("general.defaultLanguage");
    const locale = this.i18n.translate("email.locale", { lang });

    await this.sendMail(
      recipientEmail,
      this.config.getString("email.shareRecipientsSubject"),
      this.config
        .getString("email.shareRecipientsMessage")
        .replaceAll("\\n", "\n")
        .replaceAll(
          "{creator}",
          creator?.username ??
          this.i18n.t("email.shareRecipientsCreatorFallback"),
        )
        .replaceAll("{creatorEmail}", creator?.email ?? "")
        .replaceAll("{shareUrl}", shareUrl)
        .replaceAll(
          "{desc}",
          description ?? this.i18n.t("email.shareRecipientsDescFallback"),
        )
        .replaceAll(
          "{expires}",
          dayjs(expiration).unix() != 0
            ? dayjs(expiration).locale(locale).fromNow()
            : this.i18n.t("email.shareRecipientsExpiresNeverFallback"),
        ),
    );
  }

  async sendShareDownloadNotification(
    creatorEmail: string,
    shareId: string,
    fileName: string,
    recipientEmail: string,
  ) {
    const shareUrl = `${this.config.getString("general.appUrl")}/s/${shareId}`;

    await this.sendMail(
      creatorEmail,
      this.config.getString("email.shareDownloadNotificationSubject"),
      this.config
        .getString("email.shareDownloadNotificationMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{recipientEmail}", recipientEmail)
        .replaceAll("{fileName}", fileName)
        .replaceAll("{shareUrl}", shareUrl),
    );
  }

  async sendResetPasswordEmail(recipientEmail: string, token: string) {
    const resetPasswordUrl = `${this.config.getString(
      "general.appUrl",
    )}/auth/resetPassword/${token}`;

    await this.sendMail(
      recipientEmail,
      this.config.getString("email.resetPasswordSubject"),
      this.config
        .getString("email.resetPasswordMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{url}", resetPasswordUrl),
    );
  }

  async sendInviteEmail(recipientEmail: string, password: string) {
    const loginUrl = `${this.config.getString("general.appUrl")}/auth/signIn`;

    await this.sendMail(
      recipientEmail,
      this.config.getString("email.inviteSubject"),
      this.config
        .getString("email.inviteMessage")
        .replaceAll("{url}", loginUrl)
        .replaceAll("{password}", password)
        .replaceAll("{email}", recipientEmail),
    );
  }

  async sendVerificationEmail(recipientEmail: string, token: string) {
    const verificationUrl = `${this.config.getString(
      "general.appUrl",
    )}/auth/verify/${token}`;

    await this.sendMail(
      recipientEmail,
      this.config.getString("email.verificationSubject"),
      this.config
        .getString("email.verificationMessage")
        .replaceAll("\\n", "\n")
        .replaceAll("{url}", verificationUrl),
    );
  }

  async sendTestMail(recipientEmail: string) {
    const subject = this.i18n.t("email.testSubject");
    const text = this.i18n.t("email.testText");
    await this.getTransporter()
      .sendMail({
        from: `"${this.config.getString("general.appName")}" <${this.config.getString(
          "smtp.email",
        )}>`,
        to: recipientEmail,
        subject,
        text,
      })
      .catch((e) => {
        this.logger.error(e);
        throw new InternalServerErrorException(e.message);
      });
  }
}
