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
  UseGuards,
} from "@nestjs/common";
import { User } from "../../prisma/generated/prisma/client";
import { Response } from "express";
import { GetUser } from "../auth/decorator/getUser.decorator";
import { JwtGuard } from "../auth/guard/jwt.guard";
import { RolesGuard } from "../auth/guard/roles.guard";
import { Roles } from "../auth/decorator/roles.decorator";
import { ConfigService } from "../config/config.service";
import { CreateUserDTO } from "./dto/createUser.dto";
import { UpdateOwnUserDTO } from "./dto/updateOwnUser.dto";
import { UpdateUserDto } from "./dto/updateUser.dto";
import { UserDTO } from "./dto/user.dto";
import { UserService } from "./user.service";

@Controller("users")
export class UserController {
  constructor(
    private userService: UserService,
    private config: ConfigService,
  ) {}

  // Own user operations
  @Get("me")
  @UseGuards(JwtGuard)
  async getCurrentUser(@GetUser() user?: User) {
    if (!user) return null;
    const userDTO = new UserDTO().from(user as unknown as Partial<UserDTO>);
    userDTO.hasPassword = !!user.password;
    return userDTO;
  }

  @Patch("me")
  @UseGuards(JwtGuard)
  async updateCurrentUser(
    @GetUser() user: User,
    @Body() data: UpdateOwnUserDTO,
  ) {
    return new UserDTO().from(await this.userService.update(user.id, data) as unknown as Partial<UserDTO>);
  }

  @Delete("me")
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async deleteCurrentUser(
    @GetUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.userService.delete(user.id);

    const isSecure = this.config.get("general.secureCookies");

    response.cookie("access_token", "accessToken", {
      maxAge: -1,
      secure: isSecure,
    });
    response.cookie("refresh_token", "", {
      path: "/api/auth/token",
      httpOnly: true,
      maxAge: -1,
      secure: isSecure,
    });
  }

  // Global user operations (admin only)
  @Get()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "auditor")
  async list() {
    return new UserDTO().fromList(await this.userService.list() as unknown as Partial<UserDTO>[]);
  }

  @Get("check-availability")
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "auditor")
  async checkAvailability(
    @Query("username") username?: string,
    @Query("email") email?: string,
  ) {
    return this.userService.checkAvailability(username, email);
  }

  @Post()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "auditor")
  async create(@Body() user: CreateUserDTO) {
    const result = await this.userService.create(user);
    if (result.temporaryPassword) {
      return { user: new UserDTO().from(result.user as unknown as Partial<UserDTO>), temporaryPassword: result.temporaryPassword };
    }
    return new UserDTO().from(result.user as unknown as Partial<UserDTO>);
  }

  @Patch(":id")
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "auditor")
  async update(@Param("id") id: string, @Body() user: UpdateUserDto) {
    return new UserDTO().from(await this.userService.update(id, user) as unknown as Partial<UserDTO>);
  }

  @Delete(":id")
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "auditor")
  async delete(@Param("id") id: string) {
    return new UserDTO().from(await this.userService.delete(id) as unknown as Partial<UserDTO>);
  }
}
