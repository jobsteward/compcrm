import { z } from "zod";

const dateTime = z.string().datetime({ offset: true });

export const appointmentStatus = z.enum(["SCHEDULED", "COMPLETED", "CANCELED"]);
const appointmentFields = {
	title: z.string().trim().min(1).max(255),
	notes: z.string().max(20000).nullable().optional(),
	startsAt: dateTime,
	endsAt: dateTime.nullable().optional(),
	timeZone: z.string().min(1).max(100),
	location: z.string().max(1000).nullable().optional(),
	ownerId: z.string().min(1).max(128),
	status: appointmentStatus,
};
export const appointmentCreateBodySchema = z.object(appointmentFields);
export const appointmentUpdateBodySchema = z
	.object({
		...appointmentFields,
		expectedVersion: z.number().int().positive(),
		archived: z.literal(false).optional(),
	})
	.partial({
		title: true,
		startsAt: true,
		timeZone: true,
		ownerId: true,
		status: true,
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
	status: appointmentStatus,
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

export const assetSource = z.enum([
	"MANUAL",
	"MOBILE_RECORDING",
	"EMAIL_ATTACHMENT",
]);
export const assetSchema = z.object({
	id: z.string(),
	customerId: z.string(),
	projectId: z.string(),
	appointmentId: z.string().nullable(),
	fileName: z.string(),
	contentType: z.string(),
	sizeBytes: z.number().int().nonnegative().nullable(),
	kind: z.string(),
	source: assetSource.nullable(),
	emailSource: z
		.object({ messageId: z.string(), attachmentId: z.string() })
		.nullable(),
	uploadedById: z.string().nullable(),
	durationMilliseconds: z.number().int().nonnegative().nullable(),
	capturedAt: dateTime.nullable(),
	createdAt: dateTime,
	updatedAt: dateTime,
	status: z.enum(["UNVERIFIED", "READY", "DELETING", "DELETED"]),
	deletedAt: dateTime.nullable(),
	version: z.number().int().positive(),
});
export const assetDetailSchema = z.object({
	asset: assetSchema,
	download: z.object({ url: z.string().url(), expiresAt: dateTime }).nullable(),
	failure: z
		.object({
			code: z.enum([
				"UPLOAD_EXPIRED",
				"UPLOAD_VERIFICATION_FAILED",
				"UPLOAD_FINALIZATION_FAILED",
			]),
			message: z.string(),
		})
		.nullable(),
});
export const assetUpdateBodySchema = z
	.strictObject({
		expectedVersion: z.number().int().positive().optional(),
		fileName: z.string().trim().min(1).max(255).optional(),
		kind: z.string().trim().min(1).max(64).optional(),
		uploadCompleted: z.literal(true).optional(),
	})
	.superRefine((input, context) => {
		const metadata = input.fileName !== undefined || input.kind !== undefined;
		if (!metadata && !input.uploadCompleted)
			context.addIssue({
				code: "custom",
				message: "Supply an asset field to update.",
			});
		if (metadata && input.expectedVersion === undefined)
			context.addIssue({
				code: "custom",
				path: ["expectedVersion"],
				message: "Metadata changes require the current version.",
			});
		if (!metadata && input.expectedVersion !== undefined)
			context.addIssue({
				code: "custom",
				path: ["expectedVersion"],
				message: "Only metadata changes accept a version.",
			});
	});
export const assetListSchema = z.object({
	items: z.array(assetSchema),
	page: z.number().int(),
	pageSize: z.number().int(),
	total: z.number().int(),
	hasNextPage: z.boolean(),
});
export const assetDeletionSchema = z.object({
	assetId: z.string(),
	status: z.enum(["DELETING", "DELETED"]),
});
export const assetCreateBodySchema = z
	.strictObject({
		fileName: z.string().min(1).max(255),
		contentType: z.string().min(1).max(255),
		sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		kind: z.string().min(1).max(64),
		source: assetSource,
		durationMilliseconds: z.number().int().nonnegative().nullable().optional(),
		capturedAt: dateTime.nullable().optional(),
		emailSource: z
			.object({ messageId: z.string().min(1), attachmentId: z.string().min(1) })
			.nullable()
			.optional(),
	})
	.superRefine((input, context) => {
		if ((input.source === "EMAIL_ATTACHMENT") !== (input.emailSource != null))
			context.addIssue({
				code: "custom",
				path: ["emailSource"],
				message:
					"Email attachments require an email source. Other sources cannot include one.",
			});
	});
export const assetCreationSchema = assetDetailSchema.extend({
	transfer: z
		.object({
			method: z.literal("PUT"),
			url: z.string().url(),
			headers: z.object({
				"Content-Type": z.string(),
				"Content-Length": z.string(),
			}),
			expiresAt: dateTime,
			maxBytes: z.number().int(),
		})
		.nullable(),
});

export type Appointment = z.infer<typeof appointmentSchema>;
export type AppointmentStatus = z.infer<typeof appointmentStatus>;
export type Asset = z.infer<typeof assetSchema>;
export type AppointmentCreateBody = z.infer<typeof appointmentCreateBodySchema>;
export type AppointmentUpdateBody = z.infer<typeof appointmentUpdateBodySchema>;
export type AssetUpdateBody = z.infer<typeof assetUpdateBodySchema>;
export type AssetCreateBody = z.infer<typeof assetCreateBodySchema>;
export type AssetCreation = z.infer<typeof assetCreationSchema>;
export type AssetDetail = z.infer<typeof assetDetailSchema>;
