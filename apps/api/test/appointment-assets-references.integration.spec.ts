import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
} from "bun:test";
import { randomUUID } from "node:crypto";
import {
	AppointmentAssetsFixture,
	assertLocalTestDatabase,
	assetTest as it,
	scopedDb,
} from "./appointment-assets.fixture";

let fixture: AppointmentAssetsFixture;

describe("appointment and asset references", () => {
	beforeAll(assertLocalTestDatabase);
	beforeEach(async () => {
		fixture = new AppointmentAssetsFixture();
		await fixture.setup();
	});
	afterEach(async () => fixture.cleanup());
	afterAll(async () => scopedDb.$disconnect());

	it("lists recordings, photos, and documents under their managed appointment", async () => {
		const { appointment } = await fixture.appointment({
			status: "COMPLETED",
			startsAt: "2025-09-10T15:00:00Z",
		});
		const files = [
			{
				fileName: "visit.wav",
				kind: "recording",
				source: "MOBILE_RECORDING" as const,
				contentType: "audio/wav",
				durationMilliseconds: 12_000,
			},
			{
				fileName: "kitchen.jpg",
				kind: "photo",
				source: "MANUAL" as const,
				contentType: "image/jpeg",
			},
			{
				fileName: "measurements.pdf",
				kind: "document",
				source: "MANUAL" as const,
				contentType: "application/pdf",
			},
		];
		const assets = [];
		for (const file of files)
			assets.push(
				await fixture.ready({
					...file,
					sizeBytes: 4,
					appointmentId: appointment.id,
				}),
			);
		const listed = await fixture.assets.service.listAppointmentAssets(
			fixture.actor,
			appointment.id,
			{ page: 1, pageSize: 25 },
		);
		expect(listed.items.map((asset) => asset.appointmentId)).toEqual(
			assets.map(() => appointment.id),
		);
		expect(listed.items.map((asset) => asset.status)).toEqual([
			"READY",
			"READY",
			"READY",
		]);
		const projectAssets = await fixture.assets.service.listProjectAssets(
			fixture.actor,
			fixture.assets.projectId,
			{ page: 1, pageSize: 25 },
		);
		expect(projectAssets.total).toBe(3);
		expect(projectAssets.items.map((asset) => asset.appointmentId)).toEqual(
			assets.map(() => appointment.id),
		);
		expect(
			(
				await fixture.appointments.getAppointment(
					fixture.actor,
					fixture.assets.projectId,
					appointment.id,
				)
			).appointment.status,
		).toBe("COMPLETED");
	});

	it("associates through the appointment create path and keeps the parent immutable", async () => {
		const { appointment } = await fixture.appointment();
		const projectAsset = await fixture.ready();
		const appointmentAsset = await fixture.ready({
			appointmentId: appointment.id,
		});
		const appointmentListing =
			await fixture.assets.service.listAppointmentAssets(
				fixture.actor,
				appointment.id,
				{ page: 1, pageSize: 25 },
			);
		expect(appointmentListing.items.map((asset) => asset.id)).toEqual([
			appointmentAsset.assetId,
		]);
		const projectListing = await fixture.assets.service.listProjectAssets(
			fixture.actor,
			fixture.assets.projectId,
			{ page: 1, pageSize: 25 },
		);
		expect(new Set(projectListing.items.map((asset) => asset.id))).toEqual(
			new Set([projectAsset.assetId, appointmentAsset.assetId]),
		);

		const before = await scopedDb.artifact.findUniqueOrThrow({
			where: { id: appointmentAsset.assetId },
		});
		const updated = await fixture.updateAsset(appointmentAsset.assetId, {
			expectedVersion: 1,
			fileName: "edited.pdf",
		});
		expect(updated.asset).toMatchObject({
			appointmentId: appointment.id,
			fileName: "edited.pdf",
			version: 2,
		});
		const after = await scopedDb.artifact.findUniqueOrThrow({
			where: { id: appointmentAsset.assetId },
		});
		expect(after.activityId).toBe(before.activityId);
		expect(after.activityId).toBe(appointment.id);
	});

	it("replays an accepted appointment create but rejects a missing target before replay", async () => {
		const { appointment } = await fixture.appointment();
		const key = randomUUID();
		const first = await fixture.createUpload(
			{ appointmentId: appointment.id },
			fixture.actor,
			key,
		);
		await fixture.archive(appointment.id);
		const replay = await fixture.createUpload(
			{ appointmentId: appointment.id },
			fixture.actor,
			key,
		);
		expect(replay.asset.id).toBe(first.asset.id);
		expect(replay.upload.id).toBe(first.upload.id);
		await scopedDb.activity.delete({ where: { id: appointment.id } });
		await expect(
			fixture.createUpload(
				{ appointmentId: appointment.id },
				fixture.actor,
				key,
			),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
	});
});
