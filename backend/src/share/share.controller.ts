import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  Share,
  ShareSecurity,
  User,
} from "../../prisma/generated/prisma/client";
import { Request, Response } from "express";
import { GetUser } from "../auth/decorator/getUser.decorator";
import { Public } from "../auth/decorator/public.decorator";
import {
  AdminOrAuditor,
  Authenticated,
} from "../auth/decorator/guards.decorator";
import { AdminShareDTO } from "./dto/adminShare.dto";
import { CreateShareDTO } from "./dto/createShare.dto";
import { MyShareDTO } from "./dto/myShare.dto";
import { ShareDTO } from "./dto/share.dto";
import { ShareMetaDataDTO } from "./dto/shareMetaData.dto";
import { SharePasswordDto } from "./dto/sharePassword.dto";
import { UpdateShareDTO } from "./dto/updateShare.dto";
import { GetShare } from "./decorator/getShare.decorator";
import {
  ShareOwnerAccess,
  StrictShareOwnerAccess,
  SharePublicAccess,
  ShareTokenAccess,
} from "./decorator/share-guards.decorator";
import { ShareService } from "./share.service";
import { CompletedShareDTO } from "./dto/shareComplete.dto";
import { getRequestIp, getRequestUserAgent } from "../utils/request.util";
import { ConfigService } from "../config/config.service";
import { PageDTO } from "../pagination/page.dto";
import { normalizePagination } from "../pagination/pagination.util";
// SEC-1.2/22.3 + 23.5: endpoints de share com limite por IP (e por recurso no
// acesso público via RequestThrottlerGuard); rotas públicas têm limites
// próprios ainda menores.
@Controller("shares")
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShareController {
  constructor(
    private shareService: ShareService,
    private config: ConfigService,
  ) {}

  @Get("all")
  @AdminOrAuditor()
  async getAllShares(@Query() query: { page?: unknown; perPage?: unknown }) {
    const { page, perPage } = normalizePagination(query);
    const page_ = await this.shareService.getShares(page, perPage);
    return PageDTO.of(
      new AdminShareDTO().fromList(page_.items),
      page_.total,
      page_.page,
      page_.perPage,
    );
  }

  @Get()
  @Authenticated()
  async getMyShares(
    @GetUser() user: User,
    @Query() query: { page?: unknown; perPage?: unknown },
  ) {
    const { page, perPage } = normalizePagination(query);
    const page_ = await this.shareService.getSharesByUser(
      user.id,
      page,
      perPage,
    );
    return PageDTO.of(
      new MyShareDTO().fromList(page_.items),
      page_.total,
      page_.page,
      page_.perPage,
    );
  }

  @Get(":id")
  @Throttle({
    default: {
      limit: 30,
      ttl: 60_000,
    },
  })
  @Public()
  @SharePublicAccess()
  async get(@Param("id") id: string, @Req() _req: Request) {
    return new ShareDTO().from(await this.shareService.get(id));
  }

  @Post(":id/view")
  @Throttle({
    default: {
      limit: 30,
      ttl: 60_000,
    },
  })
  @Public()
  @SharePublicAccess()
  async recordView(@Param("id") id: string, @Req() req: Request) {
    const share = (await this.shareService.get(id)) as Share & {
      name?: string | null;
      creator?: { username?: string } | null;
    };
    const user = req.user as User | undefined;
    if (!user || (share.creatorId !== user.id && !user.isAdmin)) {
      const shareToken = req.cookies?.[`share_${id}_token`] as
        string | undefined;
      await this.shareService.increaseViewCount(share as Share, {
        ip: getRequestIp(req),
        userAgent: getRequestUserAgent(req),
        shareName: share.name ?? null,
        creatorUsername: share.creator?.username ?? null,
        authMethod: user ? "session" : shareToken ? "shareToken" : "anonymous",
        referer: req.headers.referer ?? null,
      });
    }
    return { ok: true };
  }

  @Get(":id/from-owner")
  @StrictShareOwnerAccess()
  async getFromOwner(@Param("id") id: string) {
    return new ShareDTO().from(await this.shareService.get(id));
  }

  @Get(":id/metaData")
  @Throttle({
    default: {
      limit: 30,
      ttl: 60_000,
    },
  })
  @Public()
  @SharePublicAccess()
  async getMetaData(@Param("id") id: string) {
    return new ShareMetaDataDTO().from(await this.shareService.getMetaData(id));
  }

  @Post()
  @Authenticated()
  async create(@Body() body: CreateShareDTO, @GetUser() user: User) {
    return new ShareDTO().from(
      (await this.shareService.create(
        body,
        user,
      )) as unknown as Partial<ShareDTO>,
    );
  }

  @Patch(":id")
  @ShareOwnerAccess()
  async update(
    @Param("id") id: string,
    @Body() body: UpdateShareDTO,
    @GetShare() share: Share & { security?: ShareSecurity },
    @GetUser() user: User,
  ) {
    return new MyShareDTO().from(
      await this.shareService.update(id, body, user, share),
    );
  }

  @Post(":id/complete")
  @HttpCode(202)
  @StrictShareOwnerAccess()
  async complete(@Param("id") id: string) {
    return new CompletedShareDTO().from(
      (await this.shareService.complete(
        id,
      )) as unknown as Partial<CompletedShareDTO>,
    );
  }

  @Delete(":id/complete")
  @StrictShareOwnerAccess()
  async revertComplete(@Param("id") id: string) {
    return new ShareDTO().from(
      (await this.shareService.revertComplete(
        id,
      )) as unknown as Partial<ShareDTO>,
    );
  }

  @Delete(":id")
  @ShareOwnerAccess()
  async remove(
    @Param("id") id: string,
    @GetUser() user: User,
    @Req() req: Request,
  ) {
    const isDeleterAdmin = user?.isAdmin === true || user?.role === "admin";
    await this.shareService.remove(id, isDeleterAdmin, {
      userId: user?.id,
      username: user?.username,
      ip: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      authMethod: "session",
      referer: req.headers.referer ?? null,
    });
  }

  @Post(":id/expire")
  @HttpCode(200)
  @ShareOwnerAccess()
  async expire(@Param("id") id: string) {
    await this.shareService.expire(id);
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 60_000,
    },
  })
  @Get("isShareIdAvailable/:id")
  @Public()
  async isShareIdAvailable(@Param("id") id: string) {
    return this.shareService.isShareIdAvailable(id);
  }

  @HttpCode(200)
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @Public()
  @ShareTokenAccess()
  @Post(":id/token")
  async getShareToken(
    @Param("id") id: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: SharePasswordDto,
  ) {
    const token = await this.shareService.getShareToken(id, body.password, {
      ip: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
    });

    this.clearShareTokenCookies(request, response);
    response.cookie(`share_${id}_token`, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.getBoolean("general.secureCookies"),
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    return { token };
  }

  /**
   * Keeps the 10 most recent share token cookies and deletes the rest. Tokens
   * são opacos (§23) — expiração/revogação é validada no servidor por hash, então
   * o limite aqui só evita acúmulo de cookies.
   */
  private clearShareTokenCookies(request: Request, response: Response) {
    const shareTokenCookies = Object.keys(request.cookies)
      .filter((key) => key.startsWith("share_") && key.endsWith("_token"));

    shareTokenCookies
      .slice(0, -10)
      .forEach((key) =>
        response.clearCookie(key, {
          path: "/",
          sameSite: "lax",
          secure: this.config.getBoolean("general.secureCookies"),
        }),
      );
  }
}
