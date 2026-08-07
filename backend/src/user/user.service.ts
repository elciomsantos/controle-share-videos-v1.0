import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "../../prisma/generated/prisma/client";
import * as crypto from "crypto";
import argon from "argon2";
import { I18nService } from "nestjs-i18n";
import { ARGON2_OPTIONS } from "../constants";
import { ConfigService } from "../config/config.service";
import { DuplicatedFieldException } from "../common/duplicated-field.exception";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { FileService } from "../file/file.service";
import { CreateUserDTO } from "./dto/createUser.dto";
import { UpdateUserDto } from "./dto/updateUser.dto";

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private fileService: FileService,
    private readonly i18n: I18nService,
    private config: ConfigService,
  ) {}

  async list() {
    return await this.prisma.user.findMany();
  }

  async get(id: string) {
    return await this.prisma.user.findUnique({ where: { id } });
  }

  private generateSecurePassword(length = 12): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const bytes = crypto.randomBytes(length);
    return Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join("");
  }

  async create(dto: CreateUserDTO) {
    let hash: string;
    let temporaryPassword: string | undefined;

    const passwordLength = this.config.getNumber("share.generatedPasswordLength");

    if (dto.generatePassword || !dto.password) {
      temporaryPassword = this.generateSecurePassword(passwordLength);
      hash = await argon.hash(temporaryPassword, ARGON2_OPTIONS);
    } else {
      hash = await argon.hash(dto.password, ARGON2_OPTIONS);
    }

    const role = dto.role ?? "operador";
    const isAdmin = role === "admin";

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username: dto.username,
            email: dto.email,
            password: hash,
            role,
            isAdmin,
            isActivated: dto.isActivated ?? true,
            shareSizeLimit: dto.shareSizeLimit ? BigInt(dto.shareSizeLimit) : null,
            passwordMustChange: true,
          },
        });

        if (temporaryPassword && this.config.getBoolean("smtp.enabled")) {
          await this.emailService.sendInviteEmail(dto.email, temporaryPassword);
        }

        this.logger.log(`User created: ${dto.email} (${dto.username})`);
        return { user, temporaryPassword };
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code == "P2002"
      ) {
        const rawField: string = (e.meta?.target as string[] | undefined)?.[0] ?? "field";
        const field: "username" | "email" = rawField === "email" ? "email" : "username";
        throw new DuplicatedFieldException(
          this.i18n.t("auth.userAlreadyExists", { args: { field } }),
          field,
        );
      }
      throw e;
    }
  }

  async update(id: string, user: UpdateUserDto) {
    try {
      const hash = user.password && (await argon.hash(user.password, ARGON2_OPTIONS));

      // Prevent demoting the last admin
      if (user.role && user.role !== "admin") {
        const targetUser = await this.prisma.user.findUnique({ where: { id } });
        if (targetUser?.isAdmin) {
          const adminCount = await this.prisma.user.count({
            where: { role: "admin" },
          });
          if (adminCount === 1) {
            throw new BadRequestException(
              this.i18n.t("auth.cannotDemoteLastAdmin"),
            );
          }
        }
      }

      const isAdmin = user.role ? user.role === "admin" : user.isAdmin;

      this.logger.log(`User updated: ${id}`);
      return await this.prisma.user.update({
        where: { id },
        data: {
          username: user.username,
          email: user.email,
          role: user.role,
          isActivated: user.isActivated,
          isAdmin,
          shareSizeLimit: user.shareSizeLimit ? BigInt(user.shareSizeLimit) : null,
          password: hash,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code == "P2002"
      ) {
        const rawField: string = (e.meta?.target as string[] | undefined)?.[0] ?? "field";
        const field: "username" | "email" = rawField === "email" ? "email" : "username";
        throw new DuplicatedFieldException(
          this.i18n.t("auth.userAlreadyExists", { args: { field } }),
          field,
        );
      }
      throw e;
    }
  }

  async checkAvailability(username?: string, email?: string) {
    if (username) {
      const exists = await this.prisma.user.findUnique({ where: { username } });
      if (exists) return { available: false, field: "username" as const };
    }
    if (email) {
      const exists = await this.prisma.user.findUnique({ where: { email } });
      if (exists) return { available: false, field: "email" as const };
    }
    return { available: true };
  }

  async delete(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { shares: true },
    });
    if (!user) throw new BadRequestException(this.i18n.t("auth.userNotFound"));

    // Check both isAdmin (legacy) and role
    const isAdminUser = user.isAdmin || user.role === "admin";
    if (isAdminUser) {
      const adminCount = await this.prisma.user.count({
        where: { role: "admin" },
      });

      if (adminCount === 1) {
        throw new BadRequestException(
          this.i18n.t("auth.cannotDeleteLastAdmin"),
        );
      }
    }

    await Promise.all(
      user.shares.map((share) => this.fileService.deleteAllFiles(share.id)),
    );

    this.logger.log(`User deleted: ${user.email}`);
    return await this.prisma.user.delete({ where: { id } });
  }
}
