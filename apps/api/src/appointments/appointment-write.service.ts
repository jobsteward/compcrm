import type { Db } from "@crm/db";
import { requireActiveProject } from "../assets/asset-access.service";
import type { AssetActor } from "../assets/asset-actor";
import { AssetError } from "../assets/asset-error";
import { AssetMutations } from "../assets/asset-mutation.service";
import {
	appointmentActor,
	appointmentInclude,
	appointmentOwner,
	appointmentResponse,
	findAppointment,
} from "./appointment-access.service";
import { createAppointment } from "./appointment-create.service";
import {
	parseAppointment,
	requireAppointmentVersion,
	validateAppointmentPatch,
	validateAppointmentSchedule,
	validateAppointmentTransition,
} from "./appointment-validation";
import {
	type AppointmentCreateInput,
	type AppointmentUpdateInput,
	appointmentArchiveSchema,
	appointmentDetailSchema,
	appointmentUpdateInput,
} from "./appointments.contracts";

export class AppointmentWrites {
	private readonly mutations: AssetMutations;
	constructor(private readonly db: Db) {
		this.mutations = new AssetMutations(db);
	}

	createAppointment(
		actor: AssetActor,
		projectId: string,
		raw: AppointmentCreateInput,
		key: string,
	) {
		return createAppointment(this.db, actor, projectId, raw, key);
	}

	async updateAppointment(
		actor: AssetActor,
		projectId: string,
		appointmentId: string,
		raw: AppointmentUpdateInput,
		key: string,
	) {
		const input = parseAppointment(appointmentUpdateInput, raw);
		validateAppointmentPatch(input);
		await appointmentActor(this.db, actor);
		return this.mutations.run(
			actor,
			projectId,
			"UPDATE_APPOINTMENT",
			`/projects/${projectId}/appointments/${appointmentId}`,
			key,
			input,
			appointmentDetailSchema,
			async (tx, project) => {
				requireActiveProject(project);
				const row = await findAppointment(tx, projectId, appointmentId);
				const details = row.appointmentDetails;
				if (row.archivedAt && input.archived !== false)
					throw new AssetError(
						409,
						"APPOINTMENT_ARCHIVED",
						"Restore the appointment before editing it.",
					);
				requireAppointmentVersion(details.version, input.expectedVersion);
				const now = new Date();
				if (input.archived === false) {
					await tx.appointmentDetails.update({
						where: { activityId: appointmentId },
						data: { version: { increment: 1 } },
					});
					const restored = await tx.activity.update({
						where: { id: appointmentId },
						data: { archivedAt: null, updatedAt: now },
						include: appointmentInclude,
					});
					return { appointment: appointmentResponse(restored) };
				}
				const startsAt = input.startsAt
					? new Date(input.startsAt)
					: details.startsAt;
				const endsAt =
					input.endsAt === undefined
						? details.endsAt
						: input.endsAt === null
							? null
							: new Date(input.endsAt);
				const status = input.status ?? details.status;
				const ownerId = input.ownerId ?? details.ownerId;
				await appointmentOwner(tx, ownerId);
				validateAppointmentTransition(details.status, status);
				validateAppointmentSchedule(
					startsAt,
					endsAt,
					input.timeZone ?? details.timeZone,
					status,
					now,
				);
				await tx.appointmentDetails.update({
					where: { activityId: appointmentId },
					data: {
						startsAt,
						endsAt,
						status,
						ownerId,
						timeZone: input.timeZone,
						location: input.location,
						statusChangedAt:
							status === details.status ? details.statusChangedAt : now,
						version: { increment: 1 },
					},
				});
				const updated = await tx.activity.update({
					where: { id: appointmentId },
					data: {
						subject: input.title,
						body: input.notes,
						occurredAt: status === "COMPLETED" ? startsAt : null,
						updatedAt: now,
					},
					include: appointmentInclude,
				});
				return { appointment: appointmentResponse(updated) };
			},
			{ appointmentId },
		);
	}

	async archiveAppointment(
		actor: AssetActor,
		projectId: string,
		appointmentId: string,
		key: string,
	) {
		await appointmentActor(this.db, actor);
		return this.mutations.run(
			actor,
			projectId,
			"ARCHIVE_APPOINTMENT",
			`/projects/${projectId}/appointments/${appointmentId}`,
			key,
			{},
			appointmentArchiveSchema,
			async (tx) => {
				const row = await findAppointment(tx, projectId, appointmentId);
				const details = row.appointmentDetails;
				if (row.archivedAt)
					return {
						appointmentId,
						archivedAt: row.archivedAt.toISOString(),
						version: details.version,
					};
				const now = new Date();
				const updated = await tx.appointmentDetails.update({
					where: { activityId: appointmentId },
					data: { version: { increment: 1 } },
				});
				await tx.activity.update({
					where: { id: appointmentId },
					data: { archivedAt: now, updatedAt: now },
				});
				return {
					appointmentId,
					archivedAt: now.toISOString(),
					version: updated.version,
				};
			},
			{ appointmentId },
		);
	}
}
