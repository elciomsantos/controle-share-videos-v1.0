import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { AdminAccessReviewController } from "./admin-access-review.controller";
import { AccessReviewService } from "./access-review.service";

@Module({
  imports: [EmailModule],
  controllers: [AdminAccessReviewController],
  providers: [AccessReviewService],
  exports: [AccessReviewService],
})
export class AccessReviewModule {}
