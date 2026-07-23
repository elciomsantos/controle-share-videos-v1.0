import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import argon from "argon2";
import * as crypto from "crypto";
import { I18nService } from "nestjs-i18n";
import { ARGON2_OPTIONS } from "../constants";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { FileService } from "../file/file.service";
import { CreateUserDTO } from "./dto/createUser.dto";
import { UpdateUserDto } from "./dto/updateUser.dto";

@Injectable()
export class UserSevice {
  private readonly logger = new Logger(UserSevice.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private fileService: FileService,
    private readonly i18n: I18nService,
  ) {}

  async list() {
    return await this.prisma.user.findMany();
  }

  async get(id: string) {
    return await this.prisma.user.findUnique({ where: { id } });
  }

  async create(dto: CreateUserDTO) {
    let hash: string;
    let randomPassword;

    // The password can be undefined if the user is invited by an admin
    if (!dto.password) {
      randomPassword = crypto.randomUUID();
      hash = await argon.hash(randomPassword, ARGON2_OPTIONS);
    } else {
      hash = await argon.hash(dto.password, ARGON2_OPTIONS);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            ...dto,
            password: hash,
          },
        });

        if (randomPassword) {
          await this.emailService.sendInviteEmail(dto.email, randomPassword);
        }

        return user;
      });
    } catch (e) {
      if (
        e instanceof PrismaClientKnownRequestError &&
        e.code == "P2002"
      ) {
        const duplicatedField: string = e.meta.target[0];
        throw new BadRequestException(
          this.i18n.t("auth.userAlreadyExists", {
            args: { field: duplicatedField },
          }),
        );
      }
      throw e;
    }
  }

  async update(id: string, user: UpdateUserDto) {
    try {
      const hash = user.password && (await argon.hash(user.password, ARGON2_OPTIONS));

      return await this.prisma.user.update({
        where: { id },
        data: { ...user, password: hash },
      });
    } catch (e) {
      if (
        e instanceof PrismaClientKnownRequestError &&
        e.code == "P2002"
      ) {
        const duplicatedField: string = e.meta.target[0];
        throw new BadRequestException(
          this.i18n.t("auth.userAlreadyExists", {
            args: { field: duplicatedField },
          }),
        );
      }
      throw e;
    }
  }

  async delete(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { shares: true },
    });
    if (!user) throw new BadRequestException(this.i18n.t("auth.userNotFound"));

    if (user.isAdmin) {
      const userCount = await this.prisma.user.count({
        where: { isAdmin: true },
      });

      if (userCount === 1) {
        throw new BadRequestException(
          this.i18n.t("auth.cannotDeleteLastAdmin"),
        );
      }
    }

    await Promise.all(
      user.shares.map((share) => this.fileService.deleteAllFiles(share.id)),
    );

    return await this.prisma.user.delete({ where: { id } });
  }
}
