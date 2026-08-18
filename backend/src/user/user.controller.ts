import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { User } from "../../prisma/generated/prisma/client";
import { Response } from "express";
import { Throttle, SkipThrottle } from "@nestjs/throttler";
import { I18nService } from "nestjs-i18n";
import { GetUser } from "../auth/decorator/getUser.decorator";
import { Authenticated, AdminOnly } from "../auth/decorator/guards.decorator";
import { ReauthRequired } from "../auth/decorator/reauth.decorator";
import { ConfigService } from "../config/config.service";
import { CreateUserDTO } from "./dto/createUser.dto";
import { UpdateOwnUserDTO } from "./dto/updateOwnUser.dto";
import { UpdateUserDto } from "./dto/updateUser.dto";
import { UserDTO } from "./dto/user.dto";
import { UserService } from "./user.service";
import {
  REFRESH_COOKIE_NAME,
  getSessionCookieName,
} from "../utils/session-cookie.util";

// SEC-1.2/22.4: endpoints administrativos de usuário com limite mais restritivo
// que o global; rotas de perfil próprio ficam no limite global.
@Controller("users")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class UserController {
  constructor(
    private userService: UserService,
    private config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  // Own user operations
  @Get("me")
  @SkipThrottle()
  @Authenticated()
  async getCurrentUser(@GetUser() user?: User) {
    if (!user) return null;
    const userDTO = new UserDTO().from(user as unknown as Partial<UserDTO>);
    userDTO.hasPassword = !!user.password;
    return userDTO;
  }

  @Patch("me")
  @SkipThrottle()
  @Authenticated()
  @ReauthRequired()
  async updateCurrentUser(
    @GetUser() user: User,
    @Body() data: UpdateOwnUserDTO,
  ) {
    return new UserDTO().from(await this.userService.update(user.id, data) as unknown as Partial<UserDTO>);
  }

  @Delete("me")
  @SkipThrottle()
  @HttpCode(204)
  @Authenticated()
  @ReauthRequired()
  async deleteCurrentUser(
    @GetUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.userService.delete(user.id);

    const isSecure = this.config.getBoolean("general.secureCookies");
    const sessionCookieName = getSessionCookieName(isSecure);

    response.cookie(sessionCookieName, "", {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      maxAge: -1,
      secure: isSecure,
    });
    response.cookie(REFRESH_COOKIE_NAME, "", {
      path: "/api/auth/token",
      httpOnly: true,
      sameSite: "strict",
      maxAge: -1,
      secure: isSecure,
    });
  }

  // Global user operations (admin only)
  @Get()
  @AdminOnly()
  async list() {
    return new UserDTO().fromList(await this.userService.list() as unknown as Partial<UserDTO>[]);
  }

  @Get("check-availability")
  @AdminOnly()
  async checkAvailability(
    @Query("username") username?: string,
    @Query("email") email?: string,
  ) {
    return this.userService.checkAvailability(username, email);
  }

  @Post()
  @AdminOnly()
  async create(@Body() user: CreateUserDTO) {
    const result = await this.userService.create(user);
    if (result.temporaryPassword) {
      return { user: new UserDTO().from(result.user as unknown as Partial<UserDTO>), temporaryPassword: result.temporaryPassword };
    }
    return new UserDTO().from(result.user as unknown as Partial<UserDTO>);
  }

  @Patch(":id")
  @AdminOnly()
  @ReauthRequired()
  async update(
    @Param("id") id: string,
    @Body() user: UpdateUserDto,
    @GetUser() currentUser: User,
  ) {
    // SEC-1.2/15.4: o admin não altera a própria senha por este canal — deve
    // usar a página "Trocar senha" da própria conta.
    if (id === currentUser.id && user.password) {
      throw new ForbiddenException(this.i18n.t("auth.cannotChangeOwnPassword"));
    }
    return new UserDTO().from(await this.userService.update(id, user) as unknown as Partial<UserDTO>);
  }

  @Delete(":id")
  @AdminOnly()
  @ReauthRequired()
  async delete(@Param("id") id: string) {
    return new UserDTO().from(await this.userService.delete(id) as unknown as Partial<UserDTO>);
  }
}
