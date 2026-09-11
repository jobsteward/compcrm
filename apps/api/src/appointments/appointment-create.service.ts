import type { Db } from "@crm/db";
import { requireActiveProject } from "../assets/asset-access.service";
import type { AssetActor } from "../assets/asset-actor";
import { AssetMutations } from "../assets/asset-mutation.service";
import {
	appointmentActor,
	appointmentInclude,
	appointmentOwner,
	appointmentResponse,
} from "./appointment-access.service";
import {
	parseAppointment,
	validateAppointmentSchedule,
	validateAppointmentTransition,
} from "./appointment-validation";
import {
	type AppointmentCreateInput,
	appointmentCreateInput,
	appointmentDetailSchema,
} from "./appointments.contracts";

export async function createAppointment(
	db: Db,
	actor: AssetActor,
	projectId: string,
	raw: AppointmentCreateInput,
	key: string,
) {
	const input = parseAppointment(appointmentCreateInput, raw);
	const createdById = await appointmentActor(db, actor);
	return new AssetMutations(db).run(
		actor,
		projectId,
		"CREATE_APPOINTMENT",
		`/projects/${projectId}/appointments`,
		key,
		input,
		appointmentDetailSchema,
		async (tx, project) => {
			requireActiveProject(project);
			const now = new Date();
			const status = input.status ?? "SCHEDULED";
			const startsAt = new Date(input.startsAt);
			const endsAt = input.endsAt ? new Date(input.endsAt) : null;
			const ownerId = input.ownerId ?? project.ownerId;
			await appointmentOwner(tx, ownerId);
			validateAppointmentTransition(null, status);
			validateAppointmentSchedule(
				startsAt,
				endsAt,
				input.timeZone,
				status,
				now,
			);
			const row = await tx.activity.create({
				data: {
					organizationId: project.organizationId,
					type: "MEETING",
					subject: input.title,
					body: input.notes ?? null,
					dealId: projectId,
					companyId: project.companyId,
					createdById,
					occurredAt: status === "COMPLETED" ? startsAt : null,
					createdAt: now,
					updatedAt: now,
					appointmentDetails: {
						create: {
							organizationId: project.organizationId,
							startsAt,
							endsAt,
							timeZone: input.timeZone,
							location: input.location ?? null,
							ownerId,
							status,
							statusChangedAt: now,
						},
					},
				},
				include: appointmentInclude,
			});
			const stale = {
				OR: [
					{ lastActivityAt: null },
					{ lastActivityAt: { lt: row.createdAt } },
				],
			};
			await tx.company.updateMany({
				where: { id: project.companyId, ...stale },
				data: { lastActivityAt: row.createdAt },
			});
			await tx.deal.updateMany({
				where: { id: projectId, ...stale },
				data: { lastActivityAt: row.createdAt },
			});
			return { appointment: appointmentResponse(row) };
		},
	);
}
