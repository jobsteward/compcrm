import { expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { scopedDb } from "@crm/db/tenant-scope";
import type { AppointmentUpdateInput } from "../src/appointments/appointments.contracts";
import { appointmentError, appointmentFixture } from "./appointments.fixture";

const f = appointmentFixture();
const update = (
	id: string,
	expectedVersion: number,
	body: Omit<AppointmentUpdateInput, "expectedVersion">,
) =>
	f.service.updateAppointment(
		f.actor,
		f.projectId,
		id,
		{ expectedVersion, ...body },
		randomUUID(),
	);

f.test(
	"creates an application-owned meeting with typed details and no contact or calendar link",
	async () => {
		const { appointment } = await f.create();
		expect(appointment).toMatchObject({
			projectId: f.projectId,
			customerId: f.companyId,
			ownerId: f.userId,
			title: "Site visit",
			startsAt: "2025-09-10T15:00:00.000Z",
			status: "SCHEDULED",
			version: 1,
			archivedAt: null,
		});
		const row = await scopedDb.activity.findUniqueOrThrow({
			where: { id: appointment.id },
		});
		expect(row).toMatchObject({
			occurredAt: null,
			contactId: null,
			calendarEventId: null,
			completedAt: null,
			dueAt: null,
		});
		expect(appointment.createdAt).toBe(appointment.updatedAt);
		const project = await scopedDb.deal.findUniqueOrThrow({
			where: { id: f.projectId },
		});
		const customer = await scopedDb.company.findUniqueOrThrow({
			where: { id: f.companyId },
		});
		expect(project.lastActivityAt?.toISOString()).toBe(appointment.createdAt);
		expect(customer.lastActivityAt?.toISOString()).toBe(appointment.createdAt);
	},
);

f.test(
	"completes, corrects dates, reopens, and cancels without treating files as state",
	async () => {
		const { appointment: a } = await f.create();
		const completed = await update(a.id, 1, { status: "COMPLETED" });
		expect(completed.appointment.version).toBe(2);
		let row = await scopedDb.activity.findUniqueOrThrow({
			where: { id: a.id },
		});
		expect(row.occurredAt?.toISOString()).toBe(a.startsAt);
		const corrected = await update(a.id, 2, {
			startsAt: "2025-09-09T10:00:00Z",
		});
		expect(corrected.appointment.statusChangedAt).toBe(
			completed.appointment.statusChangedAt,
		);
		row = await scopedDb.activity.findUniqueOrThrow({ where: { id: a.id } });
		expect(row.occurredAt?.toISOString()).toBe("2025-09-09T10:00:00.000Z");
		await appointmentError(
			update(a.id, 3, { status: "CANCELED" }),
			"INVALID_APPOINTMENT_STATE",
		);
		await update(a.id, 3, { status: "SCHEDULED" });
		row = await scopedDb.activity.findUniqueOrThrow({ where: { id: a.id } });
		expect(row.occurredAt).toBeNull();
		await update(a.id, 4, { status: "CANCELED" });
		await appointmentError(
			update(a.id, 5, { status: "COMPLETED" }),
			"INVALID_APPOINTMENT_STATE",
		);
		await update(a.id, 5, { status: "SCHEDULED" });
	},
);

f.test(
	"rejects future completed creation and correction, invalid dates and time zones",
	async () => {
		await appointmentError(
			f.create({ status: "COMPLETED", startsAt: "2099-01-01T00:00:00Z" }),
			"VALIDATION_ERROR",
		);
		await appointmentError(
			f.create({ status: "CANCELED" }),
			"INVALID_APPOINTMENT_STATE",
		);
		await appointmentError(
			f.create({ startsAt: "2025-01-01T10:00:00" }),
			"VALIDATION_ERROR",
		);
		await appointmentError(
			f.create({ endsAt: "2025-09-09T10:00:00Z" }),
			"VALIDATION_ERROR",
		);
		await appointmentError(
			f.create({ timeZone: "wrong/timezone" }),
			"VALIDATION_ERROR",
		);
		const { appointment: a } = await f.create({
			status: "COMPLETED",
			endsAt: "2025-09-10T16:00:00Z",
		});
		await appointmentError(
			update(a.id, 1, { startsAt: "2099-01-01T00:00:00Z", endsAt: null }),
			"VALIDATION_ERROR",
		);
		await appointmentError(
			update(a.id, 1, { startsAt: "2025-09-10T17:00:00Z" }),
			"VALIDATION_ERROR",
		);
		const changed = await update(a.id, 1, {
			notes: null,
			endsAt: null,
			location: null,
		});
		expect(changed.appointment).toMatchObject({
			notes: null,
			endsAt: null,
			location: null,
		});
	},
);

f.test(
	"rejects empty, unknown, mixed restore and incorrectly typed mutation fields",
	async () => {
		const { appointment: a } = await f.create();
		for (const body of [
			{},
			{ nope: true },
			{ archived: true },
			{ archived: "false" },
			{ archived: false, title: "Mixed" },
			{ expectedVersion: "1", title: "Bad" },
		]) {
			await appointmentError(
				update(
					a.id,
					1,
					body as Omit<AppointmentUpdateInput, "expectedVersion">,
				),
				"VALIDATION_ERROR",
			);
		}
	},
);
