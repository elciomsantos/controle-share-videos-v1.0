import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "../auth/guard/jwt.guard";
import { RolesGuard } from "../auth/guard/roles.guard";
import { Roles } from "../auth/decorator/roles.decorator";
import { GetUser } from "../auth/decorator/getUser.decorator";
import type { User } from "../../prisma/generated/prisma/client";
import {
  AccessReviewRecord,
  AccessReviewService,
  ReviewCertifyDto,
} from "./access-review.service";

// SEC-1.2/22.4: endpoints administrativos com limite mais restritivo.
@ApiTags("Admin - Access Review")
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Roles("admin")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller("admin/access-review")
export class AdminAccessReviewController {
  constructor(private accessReviewService: AccessReviewService) {}

  @Get()
  @ApiOperation({ summary: "List all users for access review" })
  async getAccessReviewData(): Promise<AccessReviewRecord[]> {
    return this.accessReviewService.list();
  }

  @Post("certify")
  @ApiOperation({ summary: "Certify user access review (signed attestation)" })
  async certifyReview(
    @Body() dto: ReviewCertifyDto,
    @GetUser() reviewer: User,
  ): Promise<{ success: true }> {
    return this.accessReviewService.certify(dto, {
      id: reviewer.id,
      email: reviewer.email,
    });
  }
}
