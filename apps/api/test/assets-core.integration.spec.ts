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
import { ASSETS } from "../src/assets/asset-config";
import {
	AssetsCoreFixture,
	assertLocalTestDatabase,
	assetTest as it,
} from "./assets-core.fixture";

let fixture: AssetsCoreFixture;
let storage: AssetsCoreFixture["storage"];
let service: AssetsCoreFixture["service"];
let worker: AssetsCoreFixture["worker"];
let actor: AssetsCoreFixture["actor"];
let userId: AssetsCoreFixture["userId"];
let projectId: AssetsCoreFixture["projectId"];
let create: AssetsCoreFixture["create"];
let put: AssetsCoreFixture["put"];
let ready: AssetsCoreFixture["ready"];
let due: AssetsCoreFixture["due"];

describe("asset state and storage transactions", () => {
	beforeAll(async () => {
		await assertLocalTestDatabase();
	});

	beforeEach(async () => {
		fixture = new AssetsCoreFixture();
		await fixture.setup();
		storage = fixture.storage;
		service = fixture.service;
		worker = fixture.worker;
		actor = fixture.actor;
		userId = fixture.userId;
		projectId = fixture.projectId;
		create = fixture.create.bind(fixture);
		put = fixture.put.bind(fixture);
		ready = fixture.ready.bind(fixture);
		due = fixture.due.bind(fixture);
	});

	afterEach(async () => {
		await fixture.cleanup();
	});

	afterAll(async () => {
		await db.$disconnect();
	});

	it("serializes concurrent creation and rejects a changed retry body", async () => {
		const key = randomUUID();
		const results = await Promise.all(
			Array.from({ length: 5 }, () => create({}, key)),
		);
		expect(new Set(results.map((result) => result.upload.id)).size).toBe(1);
		expect(await db.assetUpload.count({ where: { projectId } })).toBe(1);
		await expect(create({ fileName: "other" }, key)).rejects.toMatchObject({
			code: "IDEMPOTENCY_CONFLICT",
		});
		await db.deal.delete({ where: { id: projectId } });
		await expect(create({}, key)).rejects.toMatchObject({
			code: "RESOURCE_NOT_FOUND",
		});
	});
	it("accepts arbitrary formats and zero bytes without a duration cap", async () => {
		const { assetId } = await ready({
			fileName: "empty.unknown",
			sizeBytes: 0,
			contentType: "arbitrary/x-format",
			durationMilliseconds: 7_200_000,
		});
		const detail = await service.getAsset(actor, projectId, assetId);
		expect(detail.asset).toMatchObject({
			sizeBytes: 0,
			contentType: "arbitrary/x-format",
			durationMilliseconds: 7_200_000,
			uploadedById: userId,
			source: "MANUAL",
		});
		expect(detail.asset).not.toHaveProperty("storageKey");
		expect(
			(await service.downloadAsset(actor, projectId, assetId)).method,
		).toBe("GET");
	});
	it("enforces the exact upload-size boundary", async () => {
		expect(
			(await create({ sizeBytes: ASSETS.maxSingleUploadBytes })).transfer
				?.maxBytes,
		).toBe(5_363_466_240);
		await expect(
			create({ sizeBytes: ASSETS.maxSingleUploadBytes + 1 }),
		).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
		expect(await db.assetUpload.count({ where: { projectId } })).toBe(1);
	});
	it("retains reservations after cancellation and releases after late-object reconciliation", async () => {
		const uploads = await Promise.all(
			Array.from({ length: ASSETS.reservationLimit }, () => create()),
		);
		for (const upload of uploads)
			await service.cancelUpload(
				actor,
				projectId,
				upload.upload.id,
				randomUUID(),
			);
		await worker.process();
		await expect(create()).rejects.toMatchObject({
			code: "UPLOAD_CAPACITY_EXCEEDED",
			retryable: true,
		});
		const firstUpload = uploads[0];
		if (!firstUpload) throw new Error("The reservation fixture is empty.");
		const first = await put(firstUpload.upload.id);
		await db.assetUpload.updateMany({
			where: { projectId },
			data: { reservationUntil: new Date(0) },
		});
		await due();
		await worker.process();
		expect(storage.objects.has(first.temporaryKey)).toBe(false);
		expect((await create()).upload.status).toBe("PENDING");
	});
	it("keeps the final object unchanged after an old PUT grant is reused", async () => {
		const result = await ready();
		const upload = await db.assetUpload.findUniqueOrThrow({
			where: { id: result.uploadId },
		});
		storage.put(upload.temporaryKey, 88, '"replacement"');
		await service.confirmUpload(actor, projectId, upload.id, randomUUID());
		await worker.process();
		expect(storage.objects.get(upload.finalKey)?.sizeBytes).toBe(4);
		expect(storage.copyCount).toBe(1);
		expect(await db.artifact.count({ where: { dealId: projectId } })).toBe(1);
	});
	it("reconciles a copy timeout without copying or inserting twice", async () => {
		const created = await create();
		await put(created.upload.id);
		storage.copyTimeout = true;
		await service.confirmUpload(
			actor,
			projectId,
			created.upload.id,
			randomUUID(),
		);
		await worker.process();
		expect(
			(await service.getUpload(actor, projectId, created.upload.id)).upload
				.status,
		).toBe("FINALIZING");
		await due();
		await worker.process();
		expect(
			(await service.getUpload(actor, projectId, created.upload.id)).upload
				.status,
		).toBe("READY");
		expect(storage.copyCount).toBe(1);
	});
});
