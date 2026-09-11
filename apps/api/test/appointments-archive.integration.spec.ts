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
	"archives idempotently, preserves details, rejects edits, and restores by version",
	async () => {
		const { appointment: a } = await f.create({ status: "COMPLETED" });
		const archived = await f.service.archiveAppointment(
			f.actor,
			f.projectId,
			a.id,
			randomUUID(),
		);
		expect(archived.version).toBe(2);
		expect(
			await f.service.archiveAppointment(
				f.actor,
				f.projectId,
				a.id,
				randomUUID(),
			),
		).toEqual(archived);
		await appointmentError(
			update(a.id, 2, { notes: "Blocked" }),
			"APPOINTMENT_ARCHIVED",
		);
		await appointmentError(
			update(a.id, 1, { archived: false }),
			"VERSION_CONFLICT",
		);
		const restored = await update(a.id, 2, { archived: false });
		expect(restored.appointment).toMatchObject({
			archivedAt: null,
			version: 3,
			status: "COMPLETED",
			startsAt: a.startsAt,
			statusChangedAt: a.statusChangedAt,
		});
	},
);

f.test(
	"allows reads and archive on archived projects but blocks creation, update and restore",
	async () => {
		const { appointment: a } = await f.create();
		await scopedDb.deal.update({
			where: { id: f.projectId },
			data: { archivedAt: new Date() },
		});
		try {
			await appointmentError(f.create(), "PROJECT_ARCHIVED");
			await appointmentError(
				update(a.id, 1, { title: "Blocked" }),
				"PROJECT_ARCHIVED",
			);
			expect(
				(await f.service.getAppointment(f.actor, f.projectId, a.id)).appointment
					.id,
			).toBe(a.id);
			expect(
				(await f.service.listAppointments(f.actor, f.projectId, {})).total,
			).toBeGreaterThan(0);
			await f.service.archiveAppointment(
				f.actor,
				f.projectId,
				a.id,
				randomUUID(),
			);
			await appointmentError(
				update(a.id, 2, { archived: false }),
				"PROJECT_ARCHIVED",
			);
		} finally {
			await scopedDb.deal.update({
				where: { id: f.projectId },
				data: { archivedAt: null },
			});
		}
	},
);
