import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { User } from "../../prisma/generated/prisma/client";
import { Request, Response } from "express";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "../config/config.service";
import { AuthService } from "./auth.service";
import { AuthTotpService } from "./authTotp.service";
import { GetUser } from "./decorator/getUser.decorator";
import { Public, Authenticated } from "./decorator/guards.decorator";
import { AuthRegisterDTO } from "./dto/authRegister.dto";
import { AuthSignInDTO } from "./dto/authSignIn.dto";
import { AuthSignInTotpDTO } from "./dto/authSignInTotp.dto";
import { EnableTotpDTO } from "./dto/enableTotp.dto";
import { VerifyAccountDTO } from "./dto/verifyAccount.dto";
import { ResendVerificationDTO } from "./dto/resendVerification.dto";
import { ResetPasswordDTO } from "./dto/resetPassword.dto";
import { TokenDTO } from "./dto/token.dto";
import { UpdatePasswordDTO } from "./dto/updatePassword.dto";
import { VerifyTotpDTO } from "./dto/verifyTotp.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private authTotpService: AuthTotpService,
    private config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  @Post("signUp")
  @Public()
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  async signUp(
    @Body() dto: AuthRegisterDTO,
    @Req() { ip }: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!this.config.getBoolean("share.allowRegistration"))
      throw new ForbiddenException(this.i18n.t("auth.registrationNotAllowed"));

    const result = await this.authService.signUp(dto, ip ?? "");

    this.authService.addTokensToResponse(
      response,
      result.refreshToken,
      result.accessToken,
    );

    return result;
  }

  @Post("signIn")
  @Public()
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  @HttpCode(200)
  async signIn(
    @Body() dto: AuthSignInDTO,
    @Req() { ip }: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.signIn(dto, ip ?? "");

    if (result.accessToken && result.refreshToken) {
      this.authService.addTokensToResponse(
        response,
        result.refreshToken,
        result.accessToken,
      );
    }

    return result;
  }

  @Post("signIn/totp")
  @Public()
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  @HttpCode(200)
  async signInTotp(
    @Body() dto: AuthSignInTotpDTO,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authTotpService.signInTotp(dto);

    this.authService.addTokensToResponse(
      response,
      result.refreshToken,
      result.accessToken,
    );

    return new TokenDTO().from(result);
  }

  @Post("resetPassword/:email")
  @Public()
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(202)
  async requestResetPassword(@Param("email") email: string) {
    await this.authService.requestResetPassword(email);
  }

  @Post("resetPassword")
  @Public()
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDTO) {
    return await this.authService.resetPassword(dto.token, dto.password);
  }

  @Post("verify")
  @Public()
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(204)
  async verifyAccount(@Body() dto: VerifyAccountDTO) {
    await this.authService.verifyAccount(dto.token);
  }

  @Post("verify/resend")
  @Public()
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(204)
  async resendVerification(@Body() dto: ResendVerificationDTO) {
    await this.authService.resendVerification(dto.email);
  }

  @Patch("password")
  @Authenticated()
  async updatePassword(
    @GetUser() user: User,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: UpdatePasswordDTO,
  ) {
    const result = await this.authService.updatePassword(
      user,
      dto.password,
      dto.oldPassword,
    );

    this.authService.addTokensToResponse(response, result.refreshToken);
    return new TokenDTO().from(result);
  }

  @Post("token")
  @Public()
  @HttpCode(200)
  async refreshAccessToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!request.cookies.refresh_token) throw new UnauthorizedException();

    const result = await this.authService.refreshAccessToken(
      request.cookies.refresh_token,
    );
    this.authService.addTokensToResponse(
      response,
      result.refreshToken,
      result.accessToken,
    );
    return new TokenDTO().from({ accessToken: result.accessToken });
  }

  @Post("signOut")
  @Public()
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.signOut(request.cookies.access_token);

    const isSecure = this.config.getBoolean("general.secureCookies");
    response.cookie("access_token", "", {
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

  @Post("logoutAll")
  @Authenticated()
  @HttpCode(204)
  async logoutAllDevices(@GetUser() user: User) {
    await this.authService.logoutAllDevices(user.id);
  }

  @Post("totp/enable")
  @Authenticated()
  async enableTotp(@GetUser() user: User, @Body() body: EnableTotpDTO) {
    return this.authTotpService.enableTotp(user, body.password);
  }

  @Post("totp/verify")
  @Authenticated()
  async verifyTotp(@GetUser() user: User, @Body() body: VerifyTotpDTO) {
    return this.authTotpService.verifyTotp(user, body.password, body.code);
  }

  @Post("totp/disable")
  @Authenticated()
  async disableTotp(@GetUser() user: User, @Body() body: VerifyTotpDTO) {
    return this.authTotpService.disableTotp(user, body.password, body.code);
  }
}
