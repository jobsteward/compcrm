import { z } from "zod";
import { assetId, assetSchema } from "./assets.contracts";

const fileName = z
	.string()
	.min(1)
	.max(255)
	.regex(/^[^/\\\p{Cc}]+$/u);

export const assetMetadataUpdateInput = z
	.strictObject({
		expectedVersion: z.number().int().positive().pipe(z.number()),
		fileName: fileName.optional(),
		kind: z.string().min(1).max(64).optional(),
		activityId: assetId.nullable().optional(),
	})
	.superRefine((input, context) => {
		if (
			input.fileName === undefined &&
			input.kind === undefined &&
			input.activityId === undefined
		) {
			context.addIssue({
				code: "custom",
				message: "Supply an asset field to update.",
			});
		}
	});

export const projectAssetMetadataUpdateInput = assetMetadataUpdateInput.extend({
	projectId: assetId,
	assetId,
});

export type AssetMetadataUpdateInput = z.infer<typeof assetMetadataUpdateInput>;
export const assetMetadataResponseSchema = z.object({ asset: assetSchema });
