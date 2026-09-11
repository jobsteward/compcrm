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
let actor: AssetsCoreFixture["actor"];
let userId: string;
let projectId: string;
let create: AssetsCoreFixture["create"];
let ready: AssetsCoreFixture["ready"];

describe("asset metadata state", () => {
	beforeAll(async () => {
		await assertLocalTestDatabase();
	});

	beforeEach(async () => {
		fixture = new AssetsCoreFixture();
		await fixture.setup();
		service = fixture.service;
		actor = fixture.actor;
		userId = fixture.userId;
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

	async function meeting(managed = false, archived = false) {
		const activity = await db.activity.create({
			data: {
				type: "MEETING",
				dealId: projectId,
				createdById: userId,
				subject: "Site visit",
			},
		});
		if (managed)
			await db.appointmentDetails.create({
				data: {
					activityId: activity.id,
					startsAt: new Date("2026-09-01T15:00:00.000Z"),
					timeZone: "America/Chicago",
					ownerId: userId,
				},
			});
		if (archived)
			await db.activity.update({
				where: { id: activity.id },
				data: { archivedAt: new Date() },
			});
		return activity;
	}

	it("updates UNVERIFIED assets and blocks other states", async () => {
		const unverified = await db.artifact.create({
			data: {
				dealId: projectId,
				type: "legacy",
				fileName: "legacy.bin",
				storageKey: `legacy-${randomUUID()}`,
			},
		});
		const updated = await service.updateAsset(
			actor,
			projectId,
			unverified.id,
			{ expectedVersion: 1, kind: "document" },
			randomUUID(),
		);
		expect(updated.asset).toMatchObject({
			status: "UNVERIFIED",
			version: 2,
			kind: "document",
		});
		await db.artifact.update({
			where: { id: unverified.id },
			data: { status: "DELETING" },
		});
		await expect(
			service.updateAsset(
				actor,
				projectId,
				unverified.id,
				{ expectedVersion: 2, fileName: "blocked.bin" },
				randomUUID(),
			),
		).rejects.toMatchObject({ code: "ASSET_NOT_READY" });
	});

	it("rejects archived managed meetings but accepts generic meetings", async () => {
		const archivedAppointment = await meeting(true, true);
		await expect(
			create({ activityId: archivedAppointment.id }),
		).rejects.toMatchObject({
			code: "APPOINTMENT_ARCHIVED",
		});
		const generic = await meeting(false, true);
		expect((await create({ activityId: generic.id })).upload.status).toBe(
			"PENDING",
		);
		const { assetId } = await ready();
		await expect(
			service.updateAsset(
				actor,
				projectId,
				assetId,
				{ expectedVersion: 1, activityId: archivedAppointment.id },
				randomUUID(),
			),
		).rejects.toMatchObject({ code: "APPOINTMENT_ARCHIVED" });
	});

	it("keeps accepted uploads renewable and confirmable after archive", async () => {
		const appointment = await meeting(true);
		const created = await create({ activityId: appointment.id });
		await db.activity.update({
			where: { id: appointment.id },
			data: { archivedAt: new Date() },
		});
		expect(
			(
				await service.renewUpload(
					actor,
					projectId,
					created.upload.id,
					randomUUID(),
				)
			).upload.id,
		).toBe(created.upload.id);
		expect(
			(
				await service.confirmUpload(
					actor,
					projectId,
					created.upload.id,
					randomUUID(),
				)
			).uploadId,
		).toBe(created.upload.id);
	});

	it("normalizes a cached legacy confirmation URL", async () => {
		const created = await create();
		const key = randomUUID();
		const first = await service.confirmUpload(
			actor,
			projectId,
			created.upload.id,
			key,
		);
		const saved = await db.assetApiRequest.findFirstOrThrow({
			where: { operation: "CONFIRM_UPLOAD", idempotencyKey: key },
		});
		await db.assetApiRequest.update({
			where: { id: saved.id },
			data: {
				responseBody: {
					uploadId: first.uploadId,
					statusUrl: `/rest/v1/projects/${projectId}/asset-uploads/${created.upload.id}`,
				},
			},
		});
		const replay = await service.confirmUpload(
			actor,
			projectId,
			created.upload.id,
			key,
		);
		expect(replay).toEqual({
			uploadId: first.uploadId,
			statusUrl: `/projects/${projectId}/asset-uploads/${created.upload.id}`,
		});
	});
});
