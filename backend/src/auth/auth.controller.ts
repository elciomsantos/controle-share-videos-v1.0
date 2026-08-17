import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
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
import { ReauthRequired } from "./decorator/reauth.decorator";
import { AuthRegisterDTO } from "./dto/authRegister.dto";
import { AuthSignInDTO } from "./dto/authSignIn.dto";
import { AuthSignInTotpDTO } from "./dto/authSignInTotp.dto";
import { EnableTotpDTO } from "./dto/enableTotp.dto";
import { EnrollTotpDTO } from "./dto/enrollTotp.dto";
import { EnrollVerifyTotpDTO } from "./dto/enrollVerifyTotp.dto";
import { ReauthenticateDTO } from "./dto/reauthenticate.dto";
import { VerifyAccountDTO } from "./dto/verifyAccount.dto";
import { ResendVerificationDTO } from "./dto/resendVerification.dto";
import { ResetPasswordDTO } from "./dto/resetPassword.dto";
import { RequestResetPasswordDTO } from "./dto/requestResetPassword.dto";
import { TokenDTO } from "./dto/token.dto";
import { UpdatePasswordDTO } from "./dto/updatePassword.dto";
import { VerifyTotpDTO } from "./dto/verifyTotp.dto";
import {
  REFRESH_COOKIE_NAME,
  getSessionCookieName,
} from "../utils/session-cookie.util";

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

  // SEC-1.2/14.6: cadastro de TOTP pré-login (contas administrativas sem 2FA).
  @Post("totp/enroll")
  @Public()
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  async enrollTotp(@Body() dto: EnrollTotpDTO) {
    return this.authTotpService.enrollTotp(dto.loginToken, dto.password);
  }

  @Post("totp/enroll/verify")
  @Public()
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  async enrollVerifyTotp(
    @Body() dto: EnrollVerifyTotpDTO,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authTotpService.enrollVerifyTotp(
      dto.loginToken,
      dto.code,
    );

    this.authService.addTokensToResponse(
      response,
      result.refreshToken,
      result.accessToken,
    );

    return { recoveryCodes: result.recoveryCodes };
  }

  // SEC-1.2/15.4: reautenticação forte para operações críticas.
  @Post("reauthenticate")
  @Authenticated()
  @HttpCode(200)
  async reauthenticate(
    @GetUser() user: User,
    @Req() request: Request,
    @Body() dto: ReauthenticateDTO,
  ) {
    const isSecure = this.config.getBoolean("general.secureCookies");
    const cookieName = getSessionCookieName(isSecure);
    const accessToken =
      request.cookies?.[cookieName] ?? request.cookies?.access_token;

    return this.authService.reauthenticate(
      user,
      dto.password,
      dto.code,
      accessToken ?? "",
    );
  }

  @Post("resetPassword/request")
  @Public()
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  @HttpCode(202)
  async requestResetPassword(@Body() dto: RequestResetPasswordDTO) {
    // SEC-NEW-1: o e-mail trafega no body (não no path), evitando vazamento
    // nos access logs do Caddy.
    await this.authService.requestResetPassword(dto.email);
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
  @ReauthRequired()
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
    const sessionCookieName = getSessionCookieName(isSecure);
    response.setHeader("Cache-Control", "no-store");
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

  // SEC-1.2/15.3: regeneração de recovery codes (uso único, exibidos uma vez).
  @Post("totp/recovery")
  @Authenticated()
  async regenerateRecoveryCodes(
    @GetUser() user: User,
    @Body() body: VerifyTotpDTO,
  ) {
    return this.authTotpService.regenerateRecoveryCodes(
      user,
      body.password,
      body.code,
    );
  }
}
