import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { scopedTransaction } from "@crm/db/tenant-scope";
import { enqueueProjectAssetPurge } from "../src/assets/asset-purge";
import {
	AppointmentAssetsFixture,
	assertLocalTestDatabase,
	assetTest as it,
	scopedDb,
} from "./appointment-assets.fixture";

let fixture: AppointmentAssetsFixture;

describe("appointment and asset purge boundaries", () => {
	beforeAll(assertLocalTestDatabase);
	beforeEach(async () => {
		fixture = new AppointmentAssetsFixture();
		await fixture.setup();
	});
	afterEach(async () => fixture.cleanup());
	afterAll(async () => scopedDb.$disconnect());

	it("purges synced calendar rows without deleting application appointments or files", async () => {
		const { appointment } = await fixture.appointment();
		const { assetId } = await fixture.ready({ activityId: appointment.id });
		const eventId = randomUUID();
		const event = await scopedDb.calendarEvent.create({
			data: {
				id: eventId,
				iCalUid: `appointment-${randomUUID()}`,
				originalStartTime: new Date("2099-09-10T15:00:00Z"),
				title: "Imported event",
				startsAt: new Date("2099-09-10T15:00:00Z"),
				endsAt: new Date("2099-09-10T16:00:00Z"),
				status: "confirmed",
				companyId: fixture.assets.companyId,
				syncedByUserId: fixture.assets.userId,
			},
		});
		const imported = await scopedDb.activity.create({
			data: {
				type: "MEETING",
				dealId: fixture.assets.projectId,
				createdById: fixture.assets.userId,
				calendarEventId: event.id,
			},
		});
		expect(
			(await fixture.google.purgeSyncedData(fixture.assets.userId)).purged,
		).toBe(1);
		expect(
			await scopedDb.calendarEvent.findUnique({ where: { id: eventId } }),
		).toBeNull();
		expect(
			await scopedDb.activity.findUnique({ where: { id: imported.id } }),
		).toBeNull();
		expect(
			(
				await fixture.appointments.getAppointment(
					fixture.actor,
					fixture.assets.projectId,
					appointment.id,
				)
			).appointment.id,
		).toBe(appointment.id);
		expect(
			(
				await fixture.assets.service.getAsset(
					fixture.actor,
					fixture.assets.projectId,
					assetId,
				)
			).asset,
		).toMatchObject({ activityId: appointment.id, status: "READY" });
	});

	it("purges project files before the deal cascade removes appointment rows", async () => {
		const { appointment } = await fixture.appointment({
			status: "COMPLETED",
			startsAt: "2025-09-10T15:00:00Z",
		});
		const { uploadId } = await fixture.ready({ activityId: appointment.id });
		const upload = await scopedDb.assetUpload.findUniqueOrThrow({
			where: { id: uploadId },
		});
		await scopedTransaction(async (tx) => {
			await enqueueProjectAssetPurge(tx, fixture.assets.projectId);
			await tx.deal.delete({ where: { id: fixture.assets.projectId } });
		});
		await fixture.assets.worker.process();
		expect(fixture.assets.storage.objects.has(upload.finalKey)).toBe(false);
		expect(
			await scopedDb.appointmentDetails.findUnique({
				where: { activityId: appointment.id },
			}),
		).toBeNull();
		expect(
			await scopedDb.activity.findUnique({ where: { id: appointment.id } }),
		).toBeNull();
		if (!upload.assetId) throw new Error("The ready upload has no asset.");
		expect(
			await scopedDb.artifact.findUnique({ where: { id: upload.assetId } }),
		).toBeNull();
	});
});
