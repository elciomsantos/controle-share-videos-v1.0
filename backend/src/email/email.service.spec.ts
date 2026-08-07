import { InternalServerErrorException } from "@nestjs/common";
import { EmailService } from "./email.service";
import { ConfigService } from "../config/config.service";
import { I18nService } from "nestjs-i18n";

describe("EmailService", () => {
  let config: { getBoolean: jest.Mock; getString: jest.Mock; getNumber: jest.Mock };
  let i18n: { t: jest.Mock; translate: jest.Mock };
  let service: EmailService;

  const transporterMock = {
    sendMail: jest.fn(),
  };

  beforeEach(() => {
    config = {
      getBoolean: jest.fn(),
      getString: jest.fn(),
      getNumber: jest.fn(),
    };
    i18n = {
      t: jest.fn((key: string) => `t:${key}`),
      translate: jest.fn(() => "pt-br"),
    };
    service = new EmailService(
      config as unknown as ConfigService,
      i18n as unknown as I18nService,
    );
    jest
      .spyOn(service as unknown as { getTransporter: () => unknown }, "getTransporter")
      .mockReturnValue(transporterMock);
    transporterMock.sendMail.mockReset();
    transporterMock.sendMail.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("sendMailToShareRecipients", () => {
    it("escapa HTML no modo HTML (desc e creator)", async () => {
      config.getBoolean.mockImplementation(
        (key: string) =>
          key === "email.enableShareEmailRecipients" ||
          key === "email.sendHtmlEmails",
      );
      config.getString.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          "general.appUrl": "https://app.example.com",
          "general.defaultLanguage": "pt-BR",
          "email.shareRecipientsSubject": "Assunto",
          "email.shareRecipientsMessage": "Corpo {creator} | {desc} | {creatorEmail}",
          "smtp.email": "noreply@example.com",
          "general.appName": "App",
        };
        return values[key] ?? "";
      });

      await service.sendMailToShareRecipients(
        "recipient@example.com",
        "rec-id",
        "share-id",
        { username: "<b>hacker</b>", email: "a@b.com" } as never,
        "<img src=x onerror=alert(1)>",
      );

      const sent = transporterMock.sendMail.mock.calls[0][0];
      expect(sent.html).toContain("&lt;b&gt;hacker&lt;/b&gt;");
      expect(sent.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
      expect(sent.html).toContain("a@b.com");
      expect(sent.html).not.toContain("<b>");
      expect(sent.html).not.toContain("<img");
    });

    it("nao escapa em modo texto puro", async () => {
      config.getBoolean.mockImplementation(
        (key: string) => key === "email.enableShareEmailRecipients",
      );
      config.getString.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          "general.appUrl": "https://app.example.com",
          "general.defaultLanguage": "pt-BR",
          "email.shareRecipientsSubject": "Assunto",
          "email.shareRecipientsMessage": "Corpo {creator} | {desc}",
          "smtp.email": "noreply@example.com",
          "general.appName": "App",
        };
        return values[key] ?? "";
      });

      await service.sendMailToShareRecipients(
        "recipient@example.com",
        "rec-id",
        "share-id",
        { username: "<b>user</b>", email: "" } as never,
        "desc <i>rica</i>",
      );

      const sent = transporterMock.sendMail.mock.calls[0][0];
      expect(sent.text).toContain("<b>user</b>");
      expect(sent.text).toContain("desc <i>rica</i>");
    });
  });

  describe("sendShareDownloadNotification", () => {
    it("escapa recipientEmail e fileName em modo HTML", async () => {
      config.getBoolean.mockImplementation(
        (key: string) => key === "email.sendHtmlEmails",
      );
      config.getString.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          "general.appUrl": "https://app.example.com",
          "email.shareDownloadNotificationSubject": "Assunto",
          "email.shareDownloadNotificationMessage":
            "{recipientEmail} baixou {fileName}",
          "smtp.email": "noreply@example.com",
          "general.appName": "App",
        };
        return values[key] ?? "";
      });

      await service.sendShareDownloadNotification(
        "creator@example.com",
        "share-id",
        "video <script>alert(1)</script>.mp4",
        "hacker@example.com",
      );

      const sent = transporterMock.sendMail.mock.calls[0][0];
      expect(sent.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;.mp4");
      expect(sent.html).not.toContain("<script>");
    });
  });

  describe("sendMail", () => {
    it("lança erro quando SMTP falha", async () => {
      config.getBoolean.mockReturnValue(false); // email.sendHtmlEmails
      config.getString
        .mockReturnValueOnce("App")
        .mockReturnValueOnce("noreply@example.com");
      transporterMock.sendMail.mockRejectedValue(new Error("smtp down"));

      await expect(
        (service as unknown as {
          sendMail: (e: string, s: string, t: string) => Promise<void>;
        }).sendMail("a@b.com", "subject", "text"),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
