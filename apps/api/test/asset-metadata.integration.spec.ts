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
let userId: string;
let projectId: string;
let create: AssetsCoreFixture["create"];
let put: AssetsCoreFixture["put"];
let ready: AssetsCoreFixture["ready"];

describe("asset metadata updates", () => {
	beforeAll(async () => {
		await assertLocalTestDatabase();
	});

	beforeEach(async () => {
		fixture = new AssetsCoreFixture();
		await fixture.setup();
		service = fixture.service;
		worker = fixture.worker;
		actor = fixture.actor;
		userId = fixture.userId;
		projectId = fixture.projectId;
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

	it("updates editable metadata and preserves upload fields", async () => {
		const collection = await db.activity.create({
			data: {
				type: "MEETING",
				dealId: projectId,
				createdById: userId,
				subject: "Site visit",
			},
		});
		const created = await create({
			fileName: "before.bin",
			kind: "document",
			activityId: collection.id,
			sizeBytes: 4,
		});
		await put(created.upload.id);
		await service.confirmUpload(
			actor,
			projectId,
			created.upload.id,
			randomUUID(),
		);
		await worker.process();
		const before = await db.artifact.findUniqueOrThrow({
			where: {
				id: (await service.getUpload(actor, projectId, created.upload.id))
					.upload.assetId as string,
			},
		});
		const updated = await service.updateAsset(
			actor,
			projectId,
			before.id,
			{
				expectedVersion: 1,
				fileName: "after.jpg",
				kind: "photo",
				activityId: null,
			},
			randomUUID(),
		);
		expect(updated.asset).toMatchObject({
			fileName: "after.jpg",
			kind: "photo",
			activityId: null,
			status: "READY",
			version: 2,
		});
		const after = await db.artifact.findUniqueOrThrow({
			where: { id: before.id },
		});
		expect(after.type).toBe("photo");
		expect(after.storageKey).toBe(before.storageKey);
		expect(after.storageBucket).toBe(before.storageBucket);
		expect(after.sizeBytes).toBe(before.sizeBytes);
		expect(after.contentType).toBe(before.contentType);
		expect(after.source).toBe(before.source);
		expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(
			before.updatedAt.getTime(),
		);
	});

	it("requires a numeric current version and rejects stale retries", async () => {
		const { assetId } = await ready();
		await expect(
			service.updateAsset(
				actor,
				projectId,
				assetId,
				{
					expectedVersion: "1" as never,
					fileName: "wrong.bin",
				},
				randomUUID(),
			),
		).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
		const first = await service.updateAsset(
			actor,
			projectId,
			assetId,
			{
				expectedVersion: 1,
				fileName: "first.bin",
			},
			randomUUID(),
		);
		expect(first.asset.version).toBe(2);
		await expect(
			service.updateAsset(
				actor,
				projectId,
				assetId,
				{
					expectedVersion: 1,
					fileName: "stale.bin",
				},
				randomUUID(),
			),
		).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
	});

	it("serializes concurrent metadata updates under the project lock", async () => {
		const { assetId } = await ready();
		const results = await Promise.allSettled([
			service.updateAsset(
				actor,
				projectId,
				assetId,
				{ expectedVersion: 1, fileName: "first.bin" },
				randomUUID(),
			),
			service.updateAsset(
				actor,
				projectId,
				assetId,
				{ expectedVersion: 1, kind: "photo" },
				randomUUID(),
			),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected"),
		).toHaveLength(1);
		expect(
			(
				results.find(
					(result) => result.status === "rejected",
				) as PromiseRejectedResult
			).reason,
		).toMatchObject({ code: "VERSION_CONFLICT" });
	});
});
