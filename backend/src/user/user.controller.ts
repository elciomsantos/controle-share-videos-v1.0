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
  Res,
} from "@nestjs/common";
import { User } from "../../prisma/generated/prisma/client";
import { Response } from "express";
import { GetUser } from "../auth/decorator/getUser.decorator";
import { Authenticated, AdminOnly } from "../auth/decorator/guards.decorator";
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

@Controller("users")
export class UserController {
  constructor(
    private userService: UserService,
    private config: ConfigService,
  ) {}

  // Own user operations
  @Get("me")
  @Authenticated()
  async getCurrentUser(@GetUser() user?: User) {
    if (!user) return null;
    const userDTO = new UserDTO().from(user as unknown as Partial<UserDTO>);
    userDTO.hasPassword = !!user.password;
    return userDTO;
  }

  @Patch("me")
  @Authenticated()
  async updateCurrentUser(
    @GetUser() user: User,
    @Body() data: UpdateOwnUserDTO,
  ) {
    return new UserDTO().from(await this.userService.update(user.id, data) as unknown as Partial<UserDTO>);
  }

  @Delete("me")
  @HttpCode(204)
  @Authenticated()
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
  async update(@Param("id") id: string, @Body() user: UpdateUserDto) {
    return new UserDTO().from(await this.userService.update(id, user) as unknown as Partial<UserDTO>);
  }

  @Delete(":id")
  @AdminOnly()
  async delete(@Param("id") id: string) {
    return new UserDTO().from(await this.userService.delete(id) as unknown as Partial<UserDTO>);
  }
}
