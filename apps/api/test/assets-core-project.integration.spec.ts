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
let service: AssetsCoreFixture["service"];
let worker: AssetsCoreFixture["worker"];
let actor: AssetsCoreFixture["actor"];
let userId: AssetsCoreFixture["userId"];
let companyId: AssetsCoreFixture["companyId"];
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
		userId = fixture.userId;
		companyId = fixture.companyId;
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

	it("renews one upload without extending intent expiry and records expired state", async () => {
		const created = await create();
		const renewal = await service.renewUpload(
			actor,
			projectId,
			created.upload.id,
			randomUUID(),
		);
		expect(renewal.upload.id).toBe(created.upload.id);
		expect(renewal.upload.expiresAt).toBe(created.upload.expiresAt);
		await db.assetUpload.update({
			where: { id: created.upload.id },
			data: { expiresAt: new Date(0) },
		});
		await expect(
			service.renewUpload(actor, projectId, created.upload.id, randomUUID()),
		).rejects.toMatchObject({
			code: "UPLOAD_STATE_CONFLICT",
			details: { state: "EXPIRED" },
		});
		expect(
			(await service.getUpload(actor, projectId, created.upload.id)).upload
				.status,
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
		await service.confirmUpload(
			actor,
			projectId,
			created.upload.id,
			randomUUID(),
		);
		await db.deal.update({
			where: { id: projectId },
			data: { archivedAt: new Date() },
		});
		await expect(create()).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
		await expect(
			service.renewUpload(actor, projectId, created.upload.id, randomUUID()),
		).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
		await expect(
			service.confirmUpload(actor, projectId, created.upload.id, randomUUID()),
		).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
		await worker.process();
		expect(
			(await service.getUpload(actor, projectId, created.upload.id)).upload
				.status,
		).toBe("READY");
	});
	it("keeps files within their project and lists both customer projects", async () => {
		const first = await ready();
		const other = await service.createUpload(
			actor,
			otherProjectId,
			metadata(),
			randomUUID(),
		);
		await put(other.upload.id);
		await service.confirmUpload(
			actor,
			otherProjectId,
			other.upload.id,
			randomUUID(),
		);
		await worker.process();
		const listing = await service.listCustomerAssets(actor, companyId, {
			page: 1,
			pageSize: 1,
		});
		expect(listing.total).toBe(2);
		expect(listing.hasNextPage).toBe(true);
		expect(
			(
				await service.listProjectAssets(actor, projectId, {
					page: 1,
					pageSize: 25,
				})
			).total,
		).toBe(1);
		await expect(
			service.getAsset(actor, otherProjectId, first.assetId),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
		await expect(
			service.getUpload(actor, otherProjectId, first.uploadId),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
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
	it("requires an existing meeting on the exact project", async () => {
		const wrong = await db.activity.create({
			data: { type: "NOTE", dealId: projectId, createdById: userId },
		});
		await expect(create({ activityId: wrong.id })).rejects.toMatchObject({
			code: "PROJECT_MISMATCH",
		});
		const meeting = await db.activity.create({
			data: { type: "MEETING", dealId: otherProjectId, createdById: userId },
		});
		await expect(create({ activityId: meeting.id })).rejects.toMatchObject({
			code: "PROJECT_MISMATCH",
		});
		await expect(create({ activityId: "absent" })).rejects.toMatchObject({
			code: "RESOURCE_NOT_FOUND",
		});
		await db.activity.update({
			where: { id: meeting.id },
			data: { dealId: projectId },
		});
		expect((await create({ activityId: meeting.id })).upload.status).toBe(
			"PENDING",
		);
	});
});
