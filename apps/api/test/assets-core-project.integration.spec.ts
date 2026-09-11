import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { scopedDb as db } from "@crm/db/tenant-scope";
import {
	AssetsCoreFixture,
	assertLocalTestDatabase,
	assetTest as it,
} from "./assets-core.fixture";

let fixture: AssetsCoreFixture;
let service: AssetsCoreFixture["service"];
let worker: AssetsCoreFixture["worker"];
let actor: AssetsCoreFixture["actor"];
let projectId: AssetsCoreFixture["projectId"];
let otherProjectId: AssetsCoreFixture["otherProjectId"];
let metadata: AssetsCoreFixture["metadata"];
let create: AssetsCoreFixture["create"];
let put: AssetsCoreFixture["put"];
let ready: AssetsCoreFixture["ready"];

describe("asset project operations", () => {
	beforeAll(async () => {
		await assertLocalTestDatabase();
	});

	beforeEach(async () => {
		fixture = new AssetsCoreFixture();
		await fixture.setup();
		service = fixture.service;
		worker = fixture.worker;
		actor = fixture.actor;
		projectId = fixture.projectId;
		otherProjectId = fixture.otherProjectId;
		metadata = fixture.metadata.bind(fixture);
		create = fixture.create.bind(fixture);
		put = fixture.put.bind(fixture);
		ready = fixture.ready.bind(fixture);
	});

	afterEach(async () => {
		await fixture.cleanup();
	});

	afterAll(async () => {
		await db.$disconnect();
	});

	it("replays creation with a fresh transfer and reports expired state", async () => {
		const key = randomUUID();
		const created = await create({}, key);
		expect(created.asset.status).toBe("UNVERIFIED");
		expect(created.transfer).not.toBeNull();
		await db.assetUpload.update({
			where: { id: created.upload.id },
			data: { grantExpiresAt: new Date(0), reservationUntil: new Date(0) },
		});
		const replay = await create({}, key);
		expect(replay.asset.id).toBe(created.asset.id);
		expect(replay.upload.id).toBe(created.upload.id);
		expect(replay.transfer).not.toBeNull();
		expect(replay.upload.grantExpiresAt.getTime()).toBeGreaterThan(0);
		await db.assetUpload.update({
			where: { id: created.upload.id },
			data: { expiresAt: new Date(0) },
		});
		const expired = await service.getAsset(actor, created.asset.id);
		expect(expired.asset.status).toBe("UNVERIFIED");
		expect(expired.download).toBeNull();
		expect(expired.failure).toMatchObject({ code: "UPLOAD_EXPIRED" });
		expect(
			(
				await db.assetUpload.findUniqueOrThrow({
					where: { id: created.upload.id },
				})
			).status,
		).toBe("PENDING");
		await worker.process();
		expect(
			(
				await db.assetUpload.findUniqueOrThrow({
					where: { id: created.upload.id },
				})
			).status,
		).toBe("EXPIRED");
		expect(
			await db.assetStorageJob.count({
				where: { uploadId: created.upload.id, operation: "DELETE_OBJECT" },
			}),
		).toBe(1);
	});
	it("rejects new work on archived projects but finishes accepted work", async () => {
		const created = await create();
		await put(created.upload.id);
		await service.updateAsset(
			actor,
			created.asset.id,
			{ uploadCompleted: true },
			randomUUID(),
		);
		await db.deal.update({
			where: { id: projectId },
			data: { archivedAt: new Date() },
		});
		await expect(create()).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
		await expect(
			service.updateAsset(
				actor,
				created.asset.id,
				{ uploadCompleted: true },
				randomUUID(),
			),
		).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
		await worker.process();
		expect((await service.getAsset(actor, created.asset.id)).asset.status).toBe(
			"READY",
		);
	});
	it("keeps files within their project and lists each project separately", async () => {
		const first = await ready();
		const other = await service.createProjectAsset(
			actor,
			otherProjectId,
			metadata(),
			randomUUID(),
		);
		const otherUpload = await db.assetUpload.findUniqueOrThrow({
			where: { assetId: other.asset.id },
		});
		await put(otherUpload.id);
		await service.updateAsset(
			actor,
			other.asset.id,
			{ uploadCompleted: true },
			randomUUID(),
		);
		await worker.process();
		const firstListing = await service.listProjectAssets(actor, projectId, {
			page: 1,
			pageSize: 25,
		});
		const otherListing = await service.listProjectAssets(
			actor,
			otherProjectId,
			{
				page: 1,
				pageSize: 25,
			},
		);
		expect(firstListing.items.map((asset) => asset.id)).toEqual([
			first.assetId,
		]);
		expect(otherListing.items.map((asset) => asset.id)).toEqual([
			other.asset.id,
		]);
	});
	it("returns an empty high page without overflowing the database offset", async () => {
		await ready();
		expect(
			await service.listProjectAssets(actor, projectId, {
				page: Number.MAX_SAFE_INTEGER,
				pageSize: 100,
			}),
		).toEqual({
			items: [],
			page: Number.MAX_SAFE_INTEGER,
			pageSize: 100,
			total: 1,
			hasNextPage: false,
		});
	});
});
