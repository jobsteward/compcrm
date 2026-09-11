import type { Prisma } from "@crm/db";
import {
	findProjectAsset,
	validateUploadActivity,
} from "./asset-access.service";
import type { AssetActor } from "./asset-actor";
import { AssetError } from "./asset-error";
import {
	type AssetMetadataUpdateInput,
	assetMetadataResponseSchema,
	assetMetadataUpdateInput,
} from "./asset-metadata.contracts";
import type { AssetMutations } from "./asset-mutation.service";
import { assetResponse } from "./asset-responses";

export class AssetMetadataService {
	constructor(private readonly mutations: AssetMutations) {}

	async updateAsset(
		actor: AssetActor,
		projectId: string,
		assetId: string,
		raw: AssetMetadataUpdateInput,
		key: string,
	) {
		const parsed = assetMetadataUpdateInput.safeParse(raw);
		if (!parsed.success)
			throw new AssetError(
				400,
				"VALIDATION_ERROR",
				"Asset metadata is invalid.",
			);
		const input = parsed.data;
		const { expectedVersion, ...changes } = input;
		return this.mutations.run(
			actor,
			projectId,
			"UPDATE_ASSET",
			`/projects/${projectId}/assets/${assetId}`,
			key,
			input as Prisma.InputJsonValue,
			assetMetadataResponseSchema,
			async (tx) => {
				const asset = await findProjectAsset(tx, projectId, assetId, actor);
				if (!["READY", "UNVERIFIED"].includes(asset.status))
					throw new AssetError(
						409,
						"ASSET_NOT_READY",
						"The asset metadata cannot be changed in its current state.",
						{ state: asset.status },
					);
				if (asset.version !== expectedVersion)
					throw new AssetError(
						409,
						"VERSION_CONFLICT",
						"Read the current asset before updating it.",
					);
				if (
					changes.activityId !== undefined &&
					changes.activityId !== asset.activityId &&
					changes.activityId !== null
				)
					await validateUploadActivity(tx, projectId, changes.activityId);
				const data: Prisma.ArtifactUpdateInput = {
					updatedAt: new Date(),
					version: { increment: 1 },
				};
				if (changes.fileName !== undefined) data.fileName = changes.fileName;
				if (changes.kind !== undefined) {
					data.kind = changes.kind;
					data.type = changes.kind;
				}
				if (changes.activityId !== undefined)
					data.activityId = changes.activityId;
				const updated = await tx.artifact.update({
					where: { id: assetId },
					data,
					include: { deal: { select: { companyId: true } } },
				});
				return { asset: assetResponse(updated) };
			},
			{
				assetId,
				activityId: changes.activityId,
			},
		);
	}
}
