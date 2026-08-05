import { PrismaClient } from "./prisma/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import argon2 from "argon2";
import * as fs from "fs";
import * as crypto from "crypto";
import * as path from "path";

async function main() {
  const adapter = new PrismaBetterSqlite3({ url: "file:./data/controle-videos.db" });
  const prisma = new PrismaClient({ adapter });

  // Clean previous test data
  await prisma.file.deleteMany({ where: { shareId: "testshare2" } });
  await prisma.shareSecurity.deleteMany({ where: { shareId: "testshare2" } });
  await prisma.share.deleteMany({ where: { id: "testshare2" } });
  await prisma.user.deleteMany({ where: { username: "testadmin" } });

  const hash = await argon2.hash("Test@12345");
  await prisma.user.create({
    data: { username: "testadmin", email: "test@example.com", password: hash, isAdmin: true, role: "admin" },
  });

  // Create share with maxViews=1
  await prisma.share.create({
    data: {
      id: "testshare2",
      name: "Test Video View",
      expiration: new Date(0),
      uploadLocked: true,
      views: 0,
      creator: { connect: { username: "testadmin" } },
      security: { create: { maxViews: 1 } },
    },
  });

  // Create a small fake video file
  const videoDir = path.join("data", "uploads", "testshare2");
  fs.mkdirSync(videoDir, { recursive: true });
  const fileId = crypto.randomUUID();
  const videoPath = path.join(videoDir, fileId);
  // Minimal mp4 header
  const mp4Bytes = Buffer.alloc(1024);
  // Write minimal file - just random data
  crypto.randomFillSync(mp4Bytes);
  fs.writeFileSync(videoPath, mp4Bytes);
  const size = fs.statSync(videoPath).size;

  await prisma.file.create({
    data: {
      id: fileId,
      name: "test_video.mp4",
      size: BigInt(size),
      shareId: "testshare2",
    },
  });

  console.log("Test setup complete. FileID:", fileId);
  console.log("Views:", (await prisma.share.findUnique({ where: { id: "testshare2" }, select: { views: true, security: true } }))?.views ?? 0);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
