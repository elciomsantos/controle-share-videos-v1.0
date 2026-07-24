import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { User } from "../../prisma/generated/prisma/client";
import { I18nService } from "nestjs-i18n";
import { GetUser } from "../auth/decorator/getUser.decorator";
import { JwtGuard } from "../auth/guard/jwt.guard";
import { ConfigService } from "../config/config.service";
import { CreateReverseShareDTO } from "./dto/createReverseShare.dto";
import { ReverseShareDTO } from "./dto/reverseShare.dto";
import { ReverseShareTokenWithShares } from "./dto/reverseShareTokenWithShares";
import { ReverseShareOwnerGuard } from "./guards/reverseShareOwner.guard";
import { ReverseShareService } from "./reverseShare.service";

@Controller("reverseShares")
export class ReverseShareController {
  constructor(
    private reverseShareService: ReverseShareService,
    private config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  @Post()
  @UseGuards(JwtGuard)
  async create(@Body() body: CreateReverseShareDTO, @GetUser() user: User) {
    const token = await this.reverseShareService.create(body, user.id);

    const link = `${this.config.get("general.appUrl")}/upload/${token}`;

    return { token, link };
  }

  @Throttle({
    default: {
      limit: 20,
      ttl: 60_000,
    },
  })
  @Get(":reverseShareToken")
  async getByToken(@Param("reverseShareToken") reverseShareToken: string) {
    const isValid = await this.reverseShareService.isValid(reverseShareToken);

    if (!isValid)
      throw new NotFoundException(this.i18n.t("reverseShare.notFound"));

    return new ReverseShareDTO().from(
      (await this.reverseShareService.getByToken(reverseShareToken)) as unknown as Partial<ReverseShareDTO>,
    );
  }

  @Get()
  @UseGuards(JwtGuard)
  async getAllByUser(@GetUser() user: User) {
    return new ReverseShareTokenWithShares().fromList(
      (await this.reverseShareService.getAllByUser(user.id)) as unknown as Partial<ReverseShareTokenWithShares>[],
    );
  }

  @Delete(":reverseShareId")
  @UseGuards(JwtGuard, ReverseShareOwnerGuard)
  async remove(@Param("reverseShareId") id: string) {
    await this.reverseShareService.remove(id);
  }
}
