import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { scopedDb as db, scopedTransaction } from "@crm/db/tenant-scope";
import { AssetError } from "../src/assets/asset-error";
import { enqueueProjectAssetPurge } from "../src/assets/asset-purge";
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
let projectId: AssetsCoreFixture["projectId"];
let otherProjectId: AssetsCoreFixture["otherProjectId"];
let create: AssetsCoreFixture["create"];
let put: AssetsCoreFixture["put"];
let ready: AssetsCoreFixture["ready"];
let due: AssetsCoreFixture["due"];

describe("asset deletion and stale work", () => {
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
		projectId = fixture.projectId;
		otherProjectId = fixture.otherProjectId;
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

	it("hides deleting assets and retries object deletion without duplicate jobs", async () => {
		const result = await ready();
		storage.deleteFailures = 1;
		expect(
			(
				await service.deleteAsset(
					actor,
					projectId,
					result.assetId,
					randomUUID(),
				)
			).status,
		).toBe("DELETING");
		await service.deleteAsset(actor, projectId, result.assetId, randomUUID());
		await expect(
			service.downloadAsset(actor, projectId, result.assetId),
		).rejects.toMatchObject({ code: "ASSET_NOT_READY" });
		expect(
			(
				await service.listProjectAssets(actor, projectId, {
					page: 1,
					pageSize: 25,
				})
			).total,
		).toBe(0);
		await worker.process();
		expect(
			(await service.getAsset(actor, projectId, result.assetId)).asset.status,
		).toBe("DELETING");
		await due();
		await worker.process();
		expect(
			(await service.getAsset(actor, projectId, result.assetId)).asset,
		).toMatchObject({ status: "DELETED", deletedAt: expect.any(String) });
		expect(
			await db.assetStorageJob.count({ where: { artifactId: result.assetId } }),
		).toBe(1);
	});
	it("preserves unknown legacy storage references during deletion", async () => {
		const legacy = await db.artifact.create({
			data: {
				dealId: projectId,
				type: "legacy",
				fileName: "old.pdf",
				storageKey: "unknown-original-location",
			},
		});
		const detail = await service.getAsset(actor, projectId, legacy.id);
		expect(detail.asset).toMatchObject({
			status: "UNVERIFIED",
			source: null,
			sizeBytes: null,
			uploadedById: null,
		});
		await expect(
			service.downloadAsset(actor, projectId, legacy.id),
		).rejects.toMatchObject({ code: "ASSET_NOT_READY" });
		await service.deleteAsset(actor, projectId, legacy.id, randomUUID());
		await worker.process();
		expect(
			(await service.getAsset(actor, projectId, legacy.id)).asset.status,
		).toBe("DELETING");
		const job = await db.assetStorageJob.findFirstOrThrow({
			where: { artifactId: legacy.id },
		});
		expect(job.bucket).toBeNull();
		expect(job.objectKey).toBe("unknown-original-location");
		expect(job.lastError).toContain("operator resolution");
	});
	it("purges a project during conditional copy and removes its orphan final object", async () => {
		const created = await create();
		const upload = await put(created.upload.id);
		await service.confirmUpload(
			actor,
			projectId,
			created.upload.id,
			randomUUID(),
		);
		storage.copyHook = async () => {
			await scopedTransaction(async (tx) => {
				await enqueueProjectAssetPurge(tx, projectId);
				await tx.deal.delete({ where: { id: projectId } });
			});
		};
		await worker.process();
		expect(await db.artifact.count({ where: { dealId: projectId } })).toBe(0);
		expect(storage.objects.has(upload.finalKey)).toBe(false);
		expect(
			await db.deal.findUnique({ where: { id: otherProjectId } }),
		).not.toBeNull();
		await expect(
			service.getUpload(actor, projectId, created.upload.id),
		).rejects.toBeInstanceOf(AssetError);
	});
	it("reconciles final objects from a stale copy after deletion already completes", async () => {
		const created = await create();
		const upload = await put(created.upload.id);
		await service.confirmUpload(actor, projectId, upload.id, randomUUID());
		let release: (() => void) | undefined;
		let copying: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			copying = resolve;
		});
		const delayed = new Promise<void>((resolve) => {
			release = resolve;
		});
		storage.copyHook = async () => {
			storage.copyHook = null;
			copying?.();
			await delayed;
		};
		const staleWorker = worker.process();
		await started;
		await db.assetStorageJob.update({
			where: { operationKey: `finalize:${upload.id}` },
			data: { leaseUntil: new Date(0) },
		});
		await worker.process();
		const complete = await service.getUpload(actor, projectId, upload.id);
		expect(complete.upload.status).toBe("READY");
		await service.deleteAsset(
			actor,
			projectId,
			complete.upload.assetId as string,
			randomUUID(),
		);
		await worker.process();
		expect(storage.objects.has(upload.finalKey)).toBe(false);
		storage.put(upload.temporaryKey);
		release?.();
		await staleWorker;
		expect(storage.objects.has(upload.finalKey)).toBe(true);
		await db.assetStorageJob.updateMany({
			where: { artifactId: complete.upload.assetId },
			data: { nextAttemptAt: new Date(0) },
		});
		await worker.process();
		expect(storage.objects.has(upload.finalKey)).toBe(false);
	});
});
