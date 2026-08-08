import { Injectable } from "@nestjs/common";
import { toBytes } from "./dto/share.dto";
import { File, ShareRecipient, ShareSecurity } from "../../prisma/generated/prisma/client";

interface ShareLike {
  files?: File[];
  creator?: unknown;
  security?: ShareSecurity | null;
  recipients?: ShareRecipient[];
  [key: string]: unknown;
}

@Injectable()
export class ShareMapper {
  transformShare(share: ShareLike): Record<string, unknown> {
    return {
      ...share,
      size: share.files?.reduce((acc: number, file: File) => acc + toBytes(file.size), 0) ?? 0,
      recipients: share.recipients?.map((recipient: ShareRecipient) => recipient.email) ?? [],
      security: {
        maxViews: share.security?.maxViews ?? null,
        maxDownloads: share.security?.maxDownloads ?? null,
        passwordProtected: !!share.security?.password,
      },
    };
  }
}
