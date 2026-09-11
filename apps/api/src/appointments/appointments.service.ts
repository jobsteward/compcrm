import type { Db, Prisma } from "@crm/db";
import { scopedTransaction } from "@crm/db/tenant-scope";
import { Injectable } from "@nestjs/common";
import { findAssetProject } from "../assets/asset-access.service";
import type { AssetActor } from "../assets/asset-actor";
import { InjectScopedDatabase } from "../database/database.constants";
import { archivedFilter } from "../trpc/list-input";
import {
	appointmentActor,
	appointmentInclude,
	appointmentResponse,
	findAppointment,
} from "./appointment-access.service";
import { invalidAppointment, parseAppointment } from "./appointment-validation";
import { AppointmentWrites } from "./appointment-write.service";
import {
	type AppointmentCreateInput,
	type AppointmentListInput,
	type AppointmentUpdateInput,
	appointmentListInput,
} from "./appointments.contracts";

@Injectable()
export class AppointmentsService {
	private readonly writes: AppointmentWrites;
	constructor(@InjectScopedDatabase() private readonly db: Db) {
		this.writes = new AppointmentWrites(db);
	}

	createAppointment(
		actor: AssetActor,
		projectId: string,
		raw: AppointmentCreateInput,
		key: string,
	) {
		return this.writes.createAppointment(actor, projectId, raw, key);
	}
	updateAppointment(
		actor: AssetActor,
		projectId: string,
		appointmentId: string,
		raw: AppointmentUpdateInput,
		key: string,
	) {
		return this.writes.updateAppointment(
			actor,
			projectId,
			appointmentId,
			raw,
			key,
		);
	}
	archiveAppointment(
		actor: AssetActor,
		projectId: string,
		appointmentId: string,
		key: string,
	) {
		return this.writes.archiveAppointment(actor, projectId, appointmentId, key);
	}
	getAppointment(actor: AssetActor, projectId: string, appointmentId: string) {
		return scopedTransaction(this.db, async (tx) => {
			await appointmentActor(tx, actor);
			await findAssetProject(tx, actor, projectId);
			return {
				appointment: appointmentResponse(
					await findAppointment(tx, projectId, appointmentId),
				),
			};
		});
	}
	async listAppointments(
		actor: AssetActor,
		projectId: string,
		raw: AppointmentListInput,
	) {
		const input = parseAppointment(appointmentListInput, raw);
		if (input.from && input.to && new Date(input.to) <= new Date(input.from))
			invalidAppointment("The upper date must follow the lower date.");
		return scopedTransaction(this.db, async (tx) => {
			await appointmentActor(tx, actor);
			await findAssetProject(tx, actor, projectId);
			const where: Prisma.ActivityWhereInput = {
				dealId: projectId,
				type: "MEETING",
				...archivedFilter(input.archived),
				appointmentDetails: {
					is: {
						status: input.status,
						ownerId: input.ownerId,
						startsAt: {
							gte: input.from ? new Date(input.from) : undefined,
							lt: input.to ? new Date(input.to) : undefined,
						},
					},
				},
			};
			const total = await tx.activity.count({ where });
			const offset = (input.page - 1) * input.pageSize;
			const rows =
				offset >= total
					? []
					: await tx.activity.findMany({
							where,
							skip: offset,
							take: input.pageSize,
							orderBy: [
								{ appointmentDetails: { startsAt: "asc" } },
								{ id: "asc" },
							],
							include: appointmentInclude,
						});
			return {
				items: rows.map(appointmentResponse),
				page: input.page,
				pageSize: input.pageSize,
				total,
				hasNextPage: offset + rows.length < total,
			};
		});
	}
}
