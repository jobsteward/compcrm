import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import {
	AssetsCoreFixture,
	assertLocalTestDatabase,
} from "./assets-core.fixture";

let fixture: AssetsCoreFixture;
let storage: AssetsCoreFixture["storage"];
let service: AssetsCoreFixture["service"];
let actor: AssetsCoreFixture["actor"];
let projectId: AssetsCoreFixture["projectId"];
let create: AssetsCoreFixture["create"];
let ready: AssetsCoreFixture["ready"];

describe("asset legacy compatibility", () => {
	beforeAll(async () => {
		await assertLocalTestDatabase();
	});

	beforeEach(async () => {
		fixture = new AssetsCoreFixture();
		await fixture.setup();
		storage = fixture.storage;
		service = fixture.service;
		actor = fixture.actor;
		projectId = fixture.projectId;
		create = fixture.create.bind(fixture);
		ready = fixture.ready.bind(fixture);
	});

	afterEach(async () => {
		await fixture.cleanup();
	});

	afterAll(async () => {
		await db.$disconnect();
	});

	it("migrates legacy artifacts without inventing object locations or source metadata", async () => {
		const schema = `asset_migration_${randomUUID().replaceAll("-", "")}`;
		const migration = await Bun.file(
			new URL(
				"../../../packages/db/prisma/migrations/20260907160000_customer_project_assets/migration.sql",
				import.meta.url,
			),
		).text();
		await db.$transaction(async (tx) => {
			await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
			await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
			await tx.$executeRaw`CREATE TABLE "artifact" ("id" TEXT PRIMARY KEY, "dealId" TEXT NOT NULL, "type" TEXT NOT NULL, "fileName" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL)`;
			await tx.$executeRaw`INSERT INTO "artifact" VALUES ('known', 'project-a', 'photo', 'photo.jpg', 'existing/key', '2025-01-01'), ('unknown', 'project-b', ${"x".repeat(65)}, 'unknown.bin', 'unresolved/key', '2025-02-01'), ('missing', 'project-c', '', 'missing', '', '2025-03-01')`;
			for (const statement of migration
				.split(";")
				.map((statement) => statement.trim())
				.filter(Boolean))
				await tx.$executeRawUnsafe(statement);
			const rows = await tx.$queryRaw<
				Array<{
					id: string;
					dealId: string;
					kind: string;
					storageKey: string;
					storageBucket: string | null;
					sizeBytes: bigint | null;
					source: string | null;
					status: string;
				}>
			>`SELECT "id", "dealId", "kind", "storageKey", "storageBucket", "sizeBytes", "source", "status" FROM "artifact" ORDER BY "id"`;
			expect(rows).toEqual([
				{
					id: "known",
					dealId: "project-a",
					kind: "photo",
					storageKey: "existing/key",
					storageBucket: null,
					sizeBytes: null,
					source: null,
					status: "UNVERIFIED",
				},
				{
					id: "missing",
					dealId: "project-c",
					kind: "file",
					storageKey: "",
					storageBucket: null,
					sizeBytes: null,
					source: null,
					status: "UNVERIFIED",
				},
				{
					id: "unknown",
					dealId: "project-b",
					kind: "file",
					storageKey: "unresolved/key",
					storageBucket: null,
					sizeBytes: null,
					source: null,
					status: "UNVERIFIED",
				},
			]);
			await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
		});
	});
	it("keeps metadata reads available without storage configuration", async () => {
		const result = await ready();
		storage.enabled = false;
		await expect(create()).rejects.toMatchObject({
			code: "STORAGE_UNAVAILABLE",
			retryable: false,
		});
		expect(
			(await service.getAsset(actor, projectId, result.assetId)).asset.status,
		).toBe("READY");
		expect(
			(
				await service.listProjectAssets(actor, projectId, {
					page: 1,
					pageSize: 25,
				})
			).total,
		).toBe(1);
	});
});
