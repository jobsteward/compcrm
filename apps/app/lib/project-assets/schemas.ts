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
	activityId: z.string().nullable(),
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
	status: z.enum(["UNVERIFIED", "READY", "DELETING", "DELETED"]),
	deletedAt: dateTime.nullable(),
	version: z.number().int().positive(),
	updatedAt: dateTime,
});

export const assetDetailSchema = z.object({ asset: assetSchema });
export const assetUpdateBodySchema = z.object({
	expectedVersion: z.number().int().positive(),
	fileName: z.string().trim().min(1).max(255),
	kind: z.string().trim().min(1).max(64),
	activityId: z.string().nullable(),
});
export const assetListSchema = z.object({
	items: z.array(assetSchema),
	page: z.number().int(),
	pageSize: z.number().int(),
	total: z.number().int(),
	hasNextPage: z.boolean(),
});
export const assetDownloadSchema = z.object({
	assetId: z.string(),
	url: z.string().url(),
	method: z.literal("GET"),
	headers: z.record(z.string(), z.string()),
	expiresAt: dateTime,
	fileName: z.string(),
	contentType: z.string(),
	sizeBytes: z.number().int().nonnegative(),
});
export const assetDeletionSchema = z.object({
	assetId: z.string(),
	status: z.enum(["DELETING", "DELETED"]),
});

export const uploadSchema = z.object({
	id: z.string(),
	customerId: z.string(),
	projectId: z.string(),
	status: z.enum([
		"PENDING",
		"FINALIZING",
		"READY",
		"FAILED",
		"CANCELED",
		"EXPIRED",
	]),
	expiresAt: dateTime,
	assetId: z.string().nullable(),
	failure: z.object({ code: z.string(), message: z.string() }).nullable(),
});
export const uploadCreateBodySchema = z.object({
	fileName: z.string().min(1).max(255),
	contentType: z.string().min(1).max(255),
	sizeBytes: z.number().int().nonnegative(),
	kind: z.string().min(1).max(64),
	source: assetSource,
	activityId: z.string().nullable(),
	durationMilliseconds: z.number().int().nonnegative().nullable().optional(),
	capturedAt: dateTime.nullable().optional(),
});
export const uploadGrantSchema = z.object({
	upload: uploadSchema,
	transfer: z
		.object({
			method: z.literal("PUT"),
			url: z.string().url(),
			headers: z.record(z.string(), z.string()),
			expiresAt: dateTime,
			maxBytes: z.number().int(),
		})
		.nullable(),
});
export const uploadStateSchema = z.object({
	upload: uploadSchema,
	pollAfterSeconds: z.number().int().nullable(),
});
export const uploadConfirmationSchema = z.object({
	uploadId: z.string(),
	statusUrl: z.string(),
});
export const uploadCancellationSchema = z.object({
	uploadId: z.string(),
	status: z.literal("CANCELED"),
});

export type Appointment = z.infer<typeof appointmentSchema>;
export type AppointmentStatus = z.infer<typeof appointmentStatus>;
export type Asset = z.infer<typeof assetSchema>;
export type AppointmentCreateBody = z.infer<typeof appointmentCreateBodySchema>;
export type AppointmentUpdateBody = z.infer<typeof appointmentUpdateBodySchema>;
export type AssetUpdateBody = z.infer<typeof assetUpdateBodySchema>;
export type UploadCreateBody = z.infer<typeof uploadCreateBodySchema>;
export type UploadGrant = z.infer<typeof uploadGrantSchema>;
export type UploadState = z.infer<typeof uploadStateSchema>;
