import { z } from "zod";
import { assetTransferSchema } from "./asset-transfer.contracts";

export const assetId = z.string().min(1).max(128);
export const assetSource = z.enum([
	"MANUAL",
	"MOBILE_RECORDING",
	"EMAIL_ATTACHMENT",
]);
export const emailSource = z.strictObject({
	messageId: z.string().min(1).max(255),
	attachmentId: z.string().min(1).max(255),
});
export const createAssetInput = z
	.strictObject({
		fileName: z
			.string()
			.min(1)
			.max(255)
			.regex(/^[^/\\\p{Cc}]+$/u),
		contentType: z
			.string()
			.min(1)
			.max(255)
			.regex(/^[^\p{Cc}]+$/u)
			.default("application/octet-stream"),
		sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		kind: z.string().min(1).max(64).default("file"),
		source: assetSource,
		durationMilliseconds: z
			.number()
			.int()
			.nonnegative()
			.max(Number.MAX_SAFE_INTEGER)
			.nullable()
			.optional(),
		capturedAt: z.iso.datetime({ offset: true }).nullable().optional(),
		emailSource: emailSource.nullable().optional(),
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
export type CreateAssetInput = z.infer<typeof createAssetInput>;
export const projectAssetCreateInput = createAssetInput.safeExtend({
	projectId: assetId,
});
export const appointmentAssetCreateInput = createAssetInput.safeExtend({
	appointmentId: assetId,
});
export const assetMemberInput = z.strictObject({ assetId });

export const assetListInput = z.strictObject({
	page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(25),
	kind: z.string().min(1).max(64).optional(),
	source: assetSource.optional(),
});
export type AssetListInput = z.infer<typeof assetListInput>;
export const projectAssetListInput = assetListInput.extend({
	projectId: assetId,
});
export const appointmentAssetListInput = assetListInput.extend({
	appointmentId: assetId,
});

export const assetSchema = z.object({
	id: assetId,
	customerId: assetId,
	projectId: assetId,
	appointmentId: assetId.nullable(),
	fileName: z.string(),
	contentType: z.string(),
	sizeBytes: z.number().int().nonnegative().nullable(),
	kind: z.string(),
	source: assetSource.nullable(),
	emailSource: emailSource.nullable(),
	uploadedById: assetId.nullable(),
	durationMilliseconds: z.number().int().nonnegative().nullable(),
	capturedAt: z.iso.datetime().nullable(),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
	version: z.number().int().positive(),
	status: z.enum(["UNVERIFIED", "READY", "DELETING", "DELETED"]),
	deletedAt: z.iso.datetime().nullable(),
});
export const assetDownloadSchema = z.object({
	url: z.url(),
	expiresAt: z.iso.datetime(),
});
export const assetFailureSchema = z.object({
	code: z.enum([
		"UPLOAD_EXPIRED",
		"UPLOAD_VERIFICATION_FAILED",
		"UPLOAD_FINALIZATION_FAILED",
	]),
	message: z.string(),
});
export const assetDetailSchema = z.object({
	asset: assetSchema,
	download: assetDownloadSchema.nullable(),
	failure: assetFailureSchema.nullable(),
});
export const assetCreationSchema = assetDetailSchema.extend({
	transfer: assetTransferSchema.nullable(),
});
export const assetListSchema = z.object({
	items: z.array(assetSchema),
	page: z.number().int(),
	pageSize: z.number().int(),
	total: z.number().int(),
	hasNextPage: z.boolean(),
});
export const assetDeletionSchema = z.object({
	assetId,
	status: z.enum(["DELETING", "DELETED"]),
});
export const assetErrorEnvelopeSchema = z.object({
	error: z.object({
		code: z.string(),
		message: z.string(),
		requestId: z.string(),
		retryable: z.boolean(),
		details: z
			.object({
				state: z.string().optional(),
				maxBytes: z.number().optional(),
				fields: z
					.array(z.object({ field: z.string(), message: z.string() }))
					.optional(),
			})
			.optional(),
	}),
});
