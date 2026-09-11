import { z } from "zod";
import { assetId, assetSchema } from "./assets.contracts";

export const assetMetadataUpdateInput = z
	.strictObject({
		expectedVersion: z.number().int().positive().pipe(z.number()).optional(),
		fileName: z
			.string()
			.min(1)
			.max(255)
			.regex(/^[^/\\\p{Cc}]+$/u)
			.optional(),
		kind: z.string().min(1).max(64).optional(),
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

export const assetUpdateInput = assetMetadataUpdateInput.safeExtend({
	assetId,
});
export type AssetMetadataUpdateInput = z.infer<typeof assetMetadataUpdateInput>;
export const assetMetadataResponseSchema = z.object({ asset: assetSchema });
