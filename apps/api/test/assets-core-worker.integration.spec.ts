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
let projectId: AssetsCoreFixture["projectId"];
let create: AssetsCoreFixture["create"];
let put: AssetsCoreFixture["put"];
let due: AssetsCoreFixture["due"];

describe("asset finalization workers", () => {
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
		create = fixture.create.bind(fixture);
		put = fixture.put.bind(fixture);
		due = fixture.due.bind(fixture);
	});

	afterEach(async () => {
		await fixture.cleanup();
	});

	afterAll(async () => {
		await db.$disconnect();
	});

	it("reclaims an expired worker lease and refuses state writes from its previous owner", async () => {
		const created = await create();
		await put(created.upload.id);
		await service.confirmUpload(
			actor,
			projectId,
			created.upload.id,
			randomUUID(),
		);
		await db.assetStorageJob.update({
			where: { operationKey: `finalize:${created.upload.id}` },
			data: {
				state: "RUNNING",
				leaseToken: "dead-worker",
				leaseUntil: new Date(0),
			},
		});
		await worker.process();
		expect(
			(await service.getUpload(actor, projectId, created.upload.id)).upload
				.status,
		).toBe("READY");
		const failed = await create();
		await put(failed.upload.id);
		await service.confirmUpload(
			actor,
			projectId,
			failed.upload.id,
			randomUUID(),
		);
		storage.copyHook = async () => {
			await db.assetStorageJob.update({
				where: { operationKey: `finalize:${failed.upload.id}` },
				data: {
					leaseUntil: new Date(Date.now() + ASSETS.worker.leaseMs),
					leaseToken: "replacement-worker",
				},
			});
		};
		await worker.process();
		expect(
			(await service.getUpload(actor, projectId, failed.upload.id)).upload
				.status,
		).toBe("FINALIZING");
		storage.copyHook = null;
		await db.assetStorageJob.update({
			where: { operationKey: `finalize:${failed.upload.id}` },
			data: { leaseUntil: new Date(0) },
		});
		await worker.process();
		expect(
			(await service.getUpload(actor, projectId, failed.upload.id)).upload
				.status,
		).toBe("READY");
	});
	it("fails verification for missing and mismatched bytes", async () => {
		for (const size of [null, 3]) {
			const created = await create();
			if (size !== null) await put(created.upload.id, size);
			await service.confirmUpload(
				actor,
				projectId,
				created.upload.id,
				randomUUID(),
			);
			await worker.process();
			expect(
				(await service.getUpload(actor, projectId, created.upload.id)).upload,
			).toMatchObject({
				status: "FAILED",
				failure: { code: "UPLOAD_VERIFICATION_FAILED" },
			});
		}
		expect(await db.artifact.count({ where: { dealId: projectId } })).toBe(0);
	});
	it("stops finalization after five failed attempts", async () => {
		const created = await create();
		await put(created.upload.id);
		storage.copyFailures = 8;
		await service.confirmUpload(
			actor,
			projectId,
			created.upload.id,
			randomUUID(),
		);
		for (let attempt = 0; attempt < 5; attempt++) {
			await due();
			await worker.process();
		}
		expect(
			(await service.getUpload(actor, projectId, created.upload.id)).upload,
		).toMatchObject({
			status: "FAILED",
			failure: { code: "UPLOAD_FINALIZATION_FAILED" },
		});
		expect(storage.copyCount).toBe(5);
	});
	it("serializes cancellation and confirmation", async () => {
		const created = await create();
		await put(created.upload.id);
		const results = await Promise.allSettled([
			service.cancelUpload(actor, projectId, created.upload.id, randomUUID()),
			service.confirmUpload(actor, projectId, created.upload.id, randomUUID()),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		await worker.process();
		const status = (
			await service.getUpload(actor, projectId, created.upload.id)
		).upload.status;
		expect(["CANCELED", "READY"]).toContain(status);
	});
});
