import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { ConfigService } from "../../config/config.service";
import { IS_PUBLIC_KEY } from "../decorator/public.decorator";
import { enhanceRequestContext } from "../../common/request-context/request-context";

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
      const result = (await super.canActivate(context)) as boolean;

      // GAP-02: stamp the authenticated user id onto the request context so
      // every downstream log line carries it via RequestContextLogger.
      const req = context
        .switchToHttp()
        .getRequest<{ user?: { id?: string } }>();
      const userId = req?.user?.id;
      if (userId) enhanceRequestContext({ userId });

      return result;
    } catch {
      return this.config.get("share.allowUnauthenticatedShares");
    }
  }
}
