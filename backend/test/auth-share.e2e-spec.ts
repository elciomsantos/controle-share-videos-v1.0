import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ThrottlerGuard, ThrottlerModule, ThrottlerStorage } from "@nestjs/throttler";
import request from "supertest";
import * as argon from "argon2";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../prisma/generated/prisma/client";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/main";
import { ConfigService } from "../src/config/config.service";
import { EPOCH_ZERO } from "../src/utils/date.util";

type Agent = ReturnType<typeof request.agent>;

// Minimal, non-destructive auth + share flow over the ephemeral test-e2e.db.
// R07: no `migrate reset -f` anywhere — schema comes from global-setup.
describe("Auth + Share (e2e)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  const agent = () => request.agent(app.getHttpServer());

  const email = "e2e@test.org";
  const username = "e2euser";
  const password = "E2e!Passw0rd";

  async function getCsrf(server: Agent) {
    const res = await server.get("/api/auth/csrf-token").expect(200);
    return res.body.token as string;
  }

  beforeAll(async () => {
    // Enable self-registration so the HTTP signUp flow is exercisable.
    prisma = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }),
    });
    await prisma.config.updateMany({
      where: { category: "share", name: "allowRegistration" },
      data: { value: "true" },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: jest.fn().mockResolvedValue({
          totalHits: 0,
          timeToExpire: 0,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
        get: jest.fn().mockResolvedValue(0),
      })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await configureApp(app, app.get(ConfigService));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it("GET /health returns OK", async () => {
    const res = await agent().get("/api/health").expect(200);
    expect(res.text).toBe("OK");
  });

  it("signs up the first user, signs in and creates/deletes a share", async () => {
    const server = agent();

    // 1. Issue CSRF cookie/token
    const token = await getCsrf(server);

    // 2. First user → admin, no email verification
    await server
      .post("/api/auth/signUp")
      .set("x-csrf-token", token)
      .send({ email, username, password })
      .expect(201);

    // 3. Sign in
    const signIn = await server
      .post("/api/auth/signIn")
      .set("x-csrf-token", token)
      .send({ email, password })
      .expect(200);

    const accessToken = signIn.body.accessToken as string;
    expect(accessToken).toBeTruthy();

    const authed = () =>
      server
        .set("Authorization", `Bearer ${accessToken}`)
        .set("x-csrf-token", token);

    // 4. Create a share
    const createRes = await authed()
      .post("/api/shares")
      .set("x-csrf-token", token)
      .send({
        id: "e2eshare1",
        name: "e2e",
        expiration: "2027-12-31T00:00:00.000Z",
        description: "e2e test share",
        recipients: [],
        security: {},
      })
      .expect(201);
    expect(createRes.body.id).toBe("e2eshare1");

    // 5. Lock the share (owner list only shows uploadLocked shares), then list
    await prisma.share.update({
      where: { id: "e2eshare1" },
      data: { uploadLocked: true },
    });
    const list = await authed().get("/api/shares").expect(200);
    // R03: listagens agora retornam envelope paginado { items, total, page, perPage, totalPages }
    expect(list.body.page).toBe(1);
    expect(list.body.perPage).toBe(20);
    expect(Array.isArray(list.body.items)).toBe(true);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    expect(list.body.items.map((s: { id: string }) => s.id)).toContain(
      "e2eshare1",
    );

    // 6. Fetch as owner
    await authed().get("/api/shares/e2eshare1/from-owner").expect(200);

    // 7. Delete the share
    await authed().delete("/api/shares/e2eshare1").expect(200);

    const afterDelete = await authed().get("/api/shares").expect(200);
    expect(afterDelete.body.items.map((s: { id: string }) => s.id)).not.toContain(
      "e2eshare1",
    );
  });

  it("rejects mutating requests without a valid CSRF token", async () => {
    const server = agent();
    const res = await server
      .post("/api/auth/signUp")
      .send({ email: "csrf-bad@test.org", username: "csrfbad", password });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("csrf_invalid");
  });

  it("rejects a signed-in user with a garbage bearer token (fail-closed)", async () => {
    await request
      .agent(app.getHttpServer())
      .set("Authorization", "Bearer not-a-real-token")
      .get("/api/shares")
      .expect(401);
  });

  it("paginates GET /api/shares with query params (R03)", async () => {
    const server = agent();
    const token = await getCsrf(server);
    // Sign in as the seeded admin (e2euser) so we have an authed session.
    const signIn = await server
      .post("/api/auth/signIn")
      .set("x-csrf-token", token)
      .send({ email, password })
      .expect(200);
    const accessToken = signIn.body.accessToken as string;
    const authed = () =>
      server
        .set("Authorization", `Bearer ${accessToken}`)
        .set("x-csrf-token", token);

    const page1 = await authed()
      .get("/api/shares?page=1&perPage=1")
      .expect(200);
    expect(page1.body.perPage).toBe(1);
    expect(Array.isArray(page1.body.items)).toBe(true);
    expect(page1.body.items.length).toBeLessThanOrEqual(1);
    expect(page1.body.totalPages).toBeGreaterThanOrEqual(1);

    const oversized = await authed()
      .get("/api/shares?perPage=9999")
      .expect(200);
    // normalizePagination clamps perPage to MAX_PER_PAGE (100).
    expect(oversized.body.perPage).toBe(100);

    const badPage = await authed()
      .get("/api/shares?page=-3")
      .expect(200);
    expect(badPage.body.page).toBe(1);
  });

  // --- QTS-03: expanded e2e coverage for critical security/limiter flows ---

  describe("config + system + user flows (e2e)", () => {
    it("GET /api/configs returns public config (Public route)", async () => {
      const res = await agent().get("/api/configs").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it("GET /api/system/info requires admin role (signed-in e2euser is admin)", async () => {
      const server = agent();
      const token = await getCsrf(server);
      const signIn = await server
        .post("/api/auth/signIn")
        .set("x-csrf-token", token)
        .send({ email, password })
        .expect(200);
      const accessToken = signIn.body.accessToken as string;
      const authed = () =>
        server
          .set("Authorization", `Bearer ${accessToken}`)
          .set("x-csrf-token", token);

      const res = await authed().get("/api/system/info").expect(200);
      expect(res.body).toBeTruthy();
      expect(typeof res.body).toBe("object");
    });

    it("GET /api/users/me returns the signed-in user", async () => {
      const server = agent();
      const token = await getCsrf(server);
      const signIn = await server
        .post("/api/auth/signIn")
        .set("x-csrf-token", token)
        .send({ email, password })
        .expect(200);
      const accessToken = signIn.body.accessToken as string;

      const res = await server
        .get("/api/users/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.email).toBe(email);
      expect(res.body.username).toBe(username);
      expect(res.body.id).toBeTruthy();
    });

    it("GET /api/users (admin list) returns serialized users without passwords", async () => {
      const server = agent();
      const token = await getCsrf(server);
      const signIn = await server
        .post("/api/auth/signIn")
        .set("x-csrf-token", token)
        .send({ email, password })
        .expect(200);
      const accessToken = signIn.body.accessToken as string;

      const res = await server
        .get("/api/users")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((u: { email: string }) => u.email === email)).toBe(
        true,
      );
      expect(
        res.body.some((u: { password?: string }) => "password" in u),
      ).toBe(false);
    });
  });

  describe("share expiration (e2e)", () => {
    it("POST /api/shares/:id/expire marks share as expired (sets expiration to now)", async () => {
      const server = agent();
      const token = await getCsrf(server);
      const signIn = await server
        .post("/api/auth/signIn")
        .set("x-csrf-token", token)
        .send({ email, password })
        .expect(200);
      const accessToken = signIn.body.accessToken as string;
      const authed = () =>
        server
          .set("Authorization", `Bearer ${accessToken}`)
          .set("x-csrf-token", token);

      await authed()
        .post("/api/shares")
        .set("x-csrf-token", token)
        .send({
          id: "e2eexpire",
          name: "will-expire",
          expiration: "2027-12-31T00:00:00.000Z",
          description: "share to expire",
          recipients: [],
          security: {},
        })
        .expect(201);

      const beforeExpire = Date.now();
      await authed().post("/api/shares/e2eexpire/expire").expect(200);
      const afterExpire = Date.now();

      const updated = await prisma.share.findUnique({
        where: { id: "e2eexpire" },
        select: { expiration: true },
      });
      expect(updated?.expiration).toBeInstanceOf(Date);
      const expTime = updated!.expiration.getTime();
      expect(expTime).toBeGreaterThanOrEqual(beforeExpire);
      expect(expTime).toBeLessThanOrEqual(afterExpire + 1000);

      await prisma.share.delete({ where: { id: "e2eexpire" } });
    });
  });

  describe("share protected by password (e2e)", () => {
    it("POST /api/shares/:id/token validates password and issues a share token", async () => {
      const server = agent();
      const token = await getCsrf(server);
      const signIn = await server
        .post("/api/auth/signIn")
        .set("x-csrf-token", token)
        .send({ email, password })
        .expect(200);
      const accessToken = signIn.body.accessToken as string;
      const authed = () =>
        server
          .set("Authorization", `Bearer ${accessToken}`)
          .set("x-csrf-token", token);

      const plainPassword = "share-pass-123";
      const hashedPassword = await argon.hash(plainPassword, {
        type: 2,
        memoryCost: 131072,
        timeCost: 4,
        parallelism: 2,
      });

      // Create share first, then security separately (works with BetterSQLite3)
      await prisma.share.create({
        data: {
          id: "e2eprotected",
          name: "protected",
          expiration: new Date("2027-12-31T00:00:00.000Z"),
          description: "password-protected share",
          creator: { connect: { email } },
        },
      });
      await prisma.shareSecurity.create({
        data: {
          shareId: "e2eprotected",
          password: hashedPassword,
        },
      });

      // Verify security was created
      const created = await prisma.share.findUnique({
        where: { id: "e2eprotected" },
        include: { security: true },
      });
      expect(created?.security).not.toBeNull();
      expect(created!.security!.password).toBe(hashedPassword);

      // Wrong password → 403 Forbidden
      await server
        .post("/api/shares/e2eprotected/token")
        .send({ password: "wrong" })
        .expect(403);

      // Correct password → 200 with token
      const agentServer = request.agent(app.getHttpServer());
      const csrfRes = await agentServer
        .get("/api/auth/csrf-token")
        .expect(200);
      const csrfToken = csrfRes.body.token;

      const res = await agentServer
        .post("/api/shares/e2eprotected/token")
        .set("x-csrf-token", csrfToken)
        .send({ password: plainPassword })
        .expect(200);
      expect(res.body.token).toBeTruthy();
      expect(typeof res.body.token).toBe("string");

      await prisma.share.delete({ where: { id: "e2eprotected" } });
    });
  });

  describe("refresh token rotation (e2e, SEC-07)", () => {
    it("POST /api/auth/token refreshes the access token", async () => {
      const server = agent();
      const token = await getCsrf(server);

      await server
        .post("/api/auth/signIn")
        .set("x-csrf-token", token)
        .send({ email, password })
        .expect(200);

      const refreshRes = await server
        .post("/api/auth/token")
        .set("x-csrf-token", token)
        .expect(200);
      expect(refreshRes.body.accessToken).toBeTruthy();
    });

    it("POST /api/auth/signOut clears session (returns 201)", async () => {
      const server = agent();
      const token = await getCsrf(server);
      await server
        .post("/api/auth/signIn")
        .set("x-csrf-token", token)
        .send({ email, password })
        .expect(200);

      await server.post("/api/auth/signOut").set("x-csrf-token", token).expect(
        201,
      );
    });
  });

  describe("account activation flow (e2e, SEC-06 area)", () => {
    it("POST /api/auth/verify/resend is silent for unknown email (no oracle)", async () => {
      const server = agent();
      const token = await getCsrf(server);

      const res = await server
        .post("/api/auth/verify/resend")
        .set("x-csrf-token", token)
        .send({ email: "this-user-does-not-exist@example.test" })
        .expect(204);
      expect(res.body).toEqual({});

      const res2 = await server
        .post("/api/auth/verify/resend")
        .set("x-csrf-token", token)
        .send({ email })
        .expect(204);
      expect(res2.body).toEqual({});
    });
  });

  describe("password reset request (e2e, SEC-03 area)", () => {
    it("POST /api/auth/resetPassword/:email returns 202 for unknown email (no oracle)", async () => {
      const server = agent();
      const token = await getCsrf(server);

      await server
        .post("/api/auth/resetPassword/unknown@example.test")
        .set("x-csrf-token", token)
        .expect(202);
    });
  });

  describe("share id availability (e2e)", () => {
    it("GET /api/shares/isShareIdAvailable/:id returns availability bool", async () => {
      const res1 = await agent()
        .get("/api/shares/isShareIdAvailable/definitely-new-id-xyz")
        .expect(200);
      expect(res1.body.isAvailable).toBe(true);

      const res2 = await agent()
        .get("/api/shares/isShareIdAvailable/e2eshare1")
        .expect(200);
      expect(typeof res2.body.isAvailable).toBe("boolean");
    });
  });
});
