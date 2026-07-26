import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { ConfigService } from "../../config/config.service";
import { IS_PUBLIC_KEY } from "../decorator/public.decorator";

@Injectable()
export class JwtGuard extends AuthGuard("jwt") {
  constructor(private config: ConfigService, private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      return this.config.get("share.allowUnauthenticatedShares");
    }
  }
}
