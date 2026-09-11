import { z } from "zod";

export const appointmentStatusSchema = z.enum([
	"SCHEDULED",
	"COMPLETED",
	"CANCELED",
]);
const dateTime = z.string().datetime({ offset: true });
const identity = z.string().min(1).max(128);

export const appointmentFields = z.object({
	title: z.string().trim().min(1).max(255),
	notes: z.string().max(20000).nullable().optional(),
	startsAt: dateTime,
	endsAt: dateTime.nullable().optional(),
	timeZone: z.string().min(1).max(100),
	location: z.string().max(1000).nullable().optional(),
	ownerId: identity.optional(),
	status: appointmentStatusSchema.optional(),
});

export const appointmentCreateInput = appointmentFields.strict();
export const appointmentUpdateInput = appointmentFields
	.partial()
	.extend({
		expectedVersion: z.number().int().positive().pipe(z.number()),
		archived: z.literal(false).optional(),
	})
	.strict();

export const appointmentListInput = z
	.object({
		page: z.number().int().min(1).default(1),
		pageSize: z.number().int().min(1).max(100).default(25),
		status: appointmentStatusSchema.optional(),
		ownerId: identity.optional(),
		from: dateTime.optional(),
		to: dateTime.optional(),
		archived: z
			.preprocess(
				(value: string | boolean) =>
					value === "true" ? true : value === "false" ? false : value,
				z.boolean(),
			)
			.default(false),
	})
	.strict();

export const projectAppointmentInput = z
	.object({
		projectId: identity,
		appointmentId: identity,
	})
	.strict();
export const projectAppointmentCreateInput = appointmentCreateInput.extend({
	projectId: identity,
});
export const projectAppointmentUpdateInput = appointmentUpdateInput.extend({
	projectId: identity,
	appointmentId: identity,
});
export const projectAppointmentListInput = appointmentListInput.extend({
	projectId: identity,
});

export const appointmentSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	customerId: z.string(),
	title: z.string(),
	notes: z.string().nullable(),
	startsAt: dateTime,
	endsAt: dateTime.nullable(),
	timeZone: z.string(),
	location: z.string().nullable(),
	ownerId: z.string(),
	status: appointmentStatusSchema,
	statusChangedAt: dateTime,
	version: z.number().int().positive(),
	archivedAt: dateTime.nullable(),
	createdById: z.string(),
	createdAt: dateTime,
	updatedAt: dateTime,
});
export const appointmentDetailSchema = z.object({
	appointment: appointmentSchema,
});
export const appointmentListSchema = z.object({
	items: z.array(appointmentSchema),
	page: z.number().int(),
	pageSize: z.number().int(),
	total: z.number().int(),
	hasNextPage: z.boolean(),
});
export const appointmentArchiveSchema = z.object({
	appointmentId: z.string(),
	archivedAt: dateTime,
	version: z.number().int().positive(),
});

export type AppointmentCreateInput = z.infer<typeof appointmentCreateInput>;
export type AppointmentUpdateInput = z.infer<typeof appointmentUpdateInput>;
export type AppointmentListInput = z.input<typeof appointmentListInput>;
