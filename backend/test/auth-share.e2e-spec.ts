import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../prisma/generated/prisma/client";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/main";
import { ConfigService } from "../src/config/config.service";

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
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
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
});
