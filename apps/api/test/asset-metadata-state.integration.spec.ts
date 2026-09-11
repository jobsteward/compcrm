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

describe("asset metadata state", () => {
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
				unverified.id,
				{ expectedVersion: 2, fileName: "blocked.bin" },
				randomUUID(),
			),
		).rejects.toMatchObject({ code: "ASSET_NOT_READY" });
	});

	it("rejects archived managed meetings but accepts generic meetings", async () => {
		const archivedAppointment = await meeting(true, true);
		await expect(
			create({ appointmentId: archivedAppointment.id }),
		).rejects.toMatchObject({
			code: "APPOINTMENT_ARCHIVED",
		});
		const generic = await meeting(false, true);
		await expect(create({ appointmentId: generic.id })).rejects.toMatchObject({
			code: "RESOURCE_NOT_FOUND",
		});
		const active = await meeting(true);
		const created = await create({ appointmentId: active.id });
		expect(created.asset).toMatchObject({
			appointmentId: active.id,
			status: "UNVERIFIED",
		});
	});

	it("finishes an accepted upload after appointment archive", async () => {
		const appointment = await meeting(true);
		const created = await create({ appointmentId: appointment.id });
		await put(created.upload.id);
		await db.activity.update({
			where: { id: appointment.id },
			data: { archivedAt: new Date() },
		});
		await service.updateAsset(
			actor,
			created.asset.id,
			{ uploadCompleted: true },
			randomUUID(),
		);
		await worker.process();
		expect(
			(await service.getAsset(actor, created.asset.id)).asset,
		).toMatchObject({
			appointmentId: appointment.id,
			status: "READY",
			version: 1,
		});
	});

	it("replays completion without creating duplicate worker jobs", async () => {
		const created = await create();
		await put(created.upload.id);
		const key = randomUUID();
		const first = await service.updateAsset(
			actor,
			created.asset.id,
			{ uploadCompleted: true },
			key,
		);
		const replay = await service.updateAsset(
			actor,
			created.asset.id,
			{ uploadCompleted: true },
			key,
		);
		expect(replay).toEqual(first);
		expect(
			await db.assetStorageJob.count({
				where: {
					uploadId: created.upload.id,
					operation: "FINALIZE_UPLOAD",
				},
			}),
		).toBe(1);
	});
});
