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
let storage: AssetsCoreFixture["storage"];
let service: AssetsCoreFixture["service"];
let worker: AssetsCoreFixture["worker"];
let actor: AssetsCoreFixture["actor"];
let projectId: AssetsCoreFixture["projectId"];
let create: AssetsCoreFixture["create"];
let put: AssetsCoreFixture["put"];
let due: AssetsCoreFixture["due"];

describe("asset worker deadlines", () => {
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

	it("aborts in-flight storage work at the invocation boundary and durably defers it", async () => {
		const created = await create();
		await put(created.upload.id);
		await service.confirmUpload(
			actor,
			projectId,
			created.upload.id,
			randomUUID(),
		);
		const controller = new AbortController();
		storage.copyHook = async (signal) => {
			if (!signal) throw new Error("The worker did not pass an abort signal.");
			await new Promise<void>((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(signal.reason), {
					once: true,
				});
				setTimeout(() => controller.abort(), 5);
			});
		};
		const start = Date.now();
		await worker.process(controller.signal);
		expect(Date.now() - start).toBeLessThan(1_000);
		const job = await db.assetStorageJob.findUniqueOrThrow({
			where: { operationKey: `finalize:${created.upload.id}` },
		});
		expect(job).toMatchObject({
			state: "PENDING",
			attempts: 0,
			leaseToken: null,
		});
		expect(job.lastError).toContain("Invocation deadline");
		expect(
			(await service.getUpload(actor, projectId, created.upload.id)).upload
				.status,
		).toBe("FINALIZING");
		storage.copyHook = null;
		await due();
		await worker.process();
		expect(
			(await service.getUpload(actor, projectId, created.upload.id)).upload
				.status,
		).toBe("READY");
	});
	it("aborts the initial source metadata request and defers finalization", async () => {
		const created = await create();
		await put(created.upload.id);
		await service.confirmUpload(
			actor,
			projectId,
			created.upload.id,
			randomUUID(),
		);
		const controller = new AbortController();
		storage.headHook = async (signal) => {
			if (!signal)
				throw new Error("The worker did not pass an abort signal to HEAD.");
			await new Promise<void>((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(signal.reason), {
					once: true,
				});
				setTimeout(() => controller.abort(), 5);
			});
		};
		const start = Date.now();
		await worker.process(controller.signal);
		expect(Date.now() - start).toBeLessThan(1_000);
		expect(storage.copyCount).toBe(0);
		const job = await db.assetStorageJob.findUniqueOrThrow({
			where: { operationKey: `finalize:${created.upload.id}` },
		});
		expect(job).toMatchObject({
			state: "PENDING",
			attempts: 0,
			leaseToken: null,
		});
		expect(job.lastError).toContain("Invocation deadline");
		expect(
			(await service.getUpload(actor, projectId, created.upload.id)).upload
				.status,
		).toBe("FINALIZING");
		storage.headHook = null;
		await due();
		await worker.process();
		expect(
			(await service.getUpload(actor, projectId, created.upload.id)).upload
				.status,
		).toBe("READY");
	});
});
