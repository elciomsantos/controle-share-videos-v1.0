import { Injectable } from "@nestjs/common";
import { toBytes } from "./dto/share.dto";

@Injectable()
export class ShareMapper {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma-relational shape; callers cast to Partial<MyShareDTO> with excludeExtraneousValues. See #6.
  transformShare(share: any) {
    return {
      ...share,
      size:
        share.files?.reduce((acc: number, file: { size: string | bigint }) => acc + toBytes(file.size), 0) ?? 0,
      recipients: share.recipients?.map((recipient: { email: string }) => recipient.email) ?? [],
      security: {
        maxViews: share.security?.maxViews,
        maxDownloads: share.security?.maxDownloads,
        passwordProtected: !!share.security?.password,
      },
    };
  }
}
