import { Global, Module } from "@nestjs/common";
import { Config } from "../../prisma/generated/prisma/client";
import { EmailModule } from "../email/email.module";
import { PrismaService } from "../prisma/prisma.service";
import { ConfigController } from "./config.controller";
import { ConfigService } from "./config.service";
import { JwtSecretService } from "./jwt-secret.service";
import { LogoService } from "./logo.service";

@Global()
@Module({
  imports: [EmailModule],
  providers: [
    {
      provide: "CONFIG_VARIABLES",
      useFactory: async (prisma: PrismaService) => {
        return await prisma.config.findMany();
      },
      inject: [PrismaService],
    },
    {
      provide: ConfigService,
      useFactory: async (prisma: PrismaService, configVariables: Config[]) => {
        const configService = new ConfigService(configVariables, prisma);
        await configService.initialize();
        return configService;
      },
      inject: [PrismaService, "CONFIG_VARIABLES"],
    },
    LogoService,
    JwtSecretService,
  ],
  controllers: [ConfigController],
  exports: [ConfigService, JwtSecretService],
})
export class ConfigModule {}
