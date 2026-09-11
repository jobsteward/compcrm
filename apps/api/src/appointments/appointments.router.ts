import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import { assetUser, idempotencyKey } from "../assets/asset-request";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { appointmentRoutes } from "./appointment-openapi";
import {
	appointmentArchiveSchema,
	appointmentDetailSchema,
	appointmentListSchema,
	projectAppointmentCreateInput,
	projectAppointmentInput,
	projectAppointmentListInput,
	projectAppointmentUpdateInput,
} from "./appointments.contracts";
import { AppointmentsService } from "./appointments.service";

@Router({ alias: "appointments" })
@UseMiddlewares(AuthMiddleware)
export class AppointmentsRouter {
	constructor(
		@Inject(AppointmentsService)
		private readonly appointments: AppointmentsService,
	) {}

	@Mutation({
		input: projectAppointmentCreateInput,
		output: appointmentDetailSchema,
		meta: appointmentRoutes.createAppointment,
	})
	createAppointment(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectAppointmentCreateInput>,
	) {
		const { projectId, ...body } = input;
		return this.appointments.createAppointment(
			assetUser(ctx),
			projectId,
			body,
			idempotencyKey(ctx),
		);
	}

	@Query({
		input: projectAppointmentListInput,
		output: appointmentListSchema,
		meta: appointmentRoutes.listAppointments,
	})
	listAppointments(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectAppointmentListInput>,
	) {
		const { projectId, ...body } = input;
		return this.appointments.listAppointments(assetUser(ctx), projectId, body);
	}

	@Query({
		input: projectAppointmentInput,
		output: appointmentDetailSchema,
		meta: appointmentRoutes.getAppointment,
	})
	getAppointment(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectAppointmentInput>,
	) {
		return this.appointments.getAppointment(
			assetUser(ctx),
			input.projectId,
			input.appointmentId,
		);
	}

	@Mutation({
		input: projectAppointmentUpdateInput,
		output: appointmentDetailSchema,
		meta: appointmentRoutes.updateAppointment,
	})
	updateAppointment(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectAppointmentUpdateInput>,
	) {
		const { projectId, appointmentId, ...body } = input;
		return this.appointments.updateAppointment(
			assetUser(ctx),
			projectId,
			appointmentId,
			body,
			idempotencyKey(ctx),
		);
	}

	@Mutation({
		input: projectAppointmentInput,
		output: appointmentArchiveSchema,
		meta: appointmentRoutes.archiveAppointment,
	})
	archiveAppointment(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectAppointmentInput>,
	) {
		return this.appointments.archiveAppointment(
			assetUser(ctx),
			input.projectId,
			input.appointmentId,
			idempotencyKey(ctx),
		);
	}
}
