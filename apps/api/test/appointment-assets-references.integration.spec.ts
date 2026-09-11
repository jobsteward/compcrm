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

	it("finalizes recordings, photos, and documents after appointment completion", async () => {
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
					activityId: appointment.id,
				}),
			);
		const listed = await fixture.assets.service.listProjectAssets(
			fixture.actor,
			fixture.assets.projectId,
			{ page: 1, pageSize: 25, activityId: appointment.id },
		);
		expect(listed.items.map((asset) => asset.activityId)).toEqual(
			assets.map(() => appointment.id),
		);
		expect(listed.items.map((asset) => asset.status)).toEqual([
			"READY",
			"READY",
			"READY",
		]);
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

	it("keeps asset upload and metadata replays dependent on live activity targets", async () => {
		const { appointment } = await fixture.appointment();
		const uploadKey = randomUUID();
		const first = await fixture.createUpload(
			{ activityId: appointment.id },
			fixture.actor,
			uploadKey,
		);
		await fixture.archive(appointment.id);
		expect(
			await fixture.createUpload(
				{ activityId: appointment.id },
				fixture.actor,
				uploadKey,
			),
		).toEqual(first);
		await scopedDb.activity.delete({ where: { id: appointment.id } });
		await expect(
			fixture.createUpload(
				{ activityId: appointment.id },
				fixture.actor,
				uploadKey,
			),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });

		const second = await fixture.appointment();
		const { assetId } = await fixture.ready({
			activityId: second.appointment.id,
		});
		const editKey = randomUUID();
		const edit = {
			expectedVersion: 1,
			fileName: "edited.pdf",
			activityId: second.appointment.id,
		};
		const updated = await fixture.updateAsset(
			assetId,
			edit,
			fixture.actor,
			editKey,
		);
		expect(
			await fixture.updateAsset(assetId, edit, fixture.actor, editKey),
		).toEqual(updated);
		await scopedDb.activity.delete({ where: { id: second.appointment.id } });
		await expect(
			fixture.updateAsset(assetId, edit, fixture.actor, editKey),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
	});
});
