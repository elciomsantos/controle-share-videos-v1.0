import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { EmailModule } from "../email/email.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthTotpService } from "./authTotp.service";
import { JwtStrategy } from "./strategy/jwt.strategy";
import { UserModule } from "../user/user.module";
import { RolesGuard } from "./guard/roles.guard";
import { PasswordMustChangeGuard } from "./guard/passwordMustChange.guard";
import { JwtGuard } from "./guard/jwt.guard";
import { ReauthGuard } from "./guard/reauth.guard";
import { LoginService } from "./service/login.service";
import { TokenService } from "./service/token.service";
import { RefreshService } from "./service/refresh.service";
import { VerificationService } from "./service/verification.service";
import { RecoveryCodeService } from "./recovery-code.service";

@Module({
  imports: [
    JwtModule.register({
      global: true,
    }),
    EmailModule,
    UserModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTotpService,
    LoginService,
    TokenService,
    RefreshService,
    VerificationService,
    RecoveryCodeService,
    JwtStrategy,
    JwtGuard,
    RolesGuard,
    PasswordMustChangeGuard,
    ReauthGuard,
  ],
  exports: [AuthService, JwtGuard, RolesGuard, PasswordMustChangeGuard],
})
export class AuthModule {}
