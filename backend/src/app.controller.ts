import { Controller, Get, Res } from "@nestjs/common";
import { Response } from "express";
import { Public } from "./auth/decorator/public.decorator";
import { PrismaService } from "./prisma/prisma.service";

@Controller("/")
export class AppController {
  constructor(private prismaService: PrismaService) {}

  @Get("health")
  @Public()
  async health(@Res({ passthrough: true }) res: Response) {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return "OK";
    } catch {
      res.statusCode = 500;
      return "ERROR";
    }
  }
}
