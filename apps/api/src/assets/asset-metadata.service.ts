import type { Prisma } from "@crm/db";
import { findProjectAsset, requireActiveProject } from "./asset-access.service";
import type { AssetActor } from "./asset-actor";
import { AssetError } from "./asset-error";
import {
	type AssetMetadataUpdateInput,
	assetMetadataResponseSchema,
	assetMetadataUpdateInput,
} from "./asset-metadata.contracts";
import type { AssetMutations } from "./asset-mutation.service";
import { assetResponse } from "./asset-responses";
import type { AssetStorageService } from "./asset-storage.service";
import { completeAssetUpload } from "./asset-upload-completion";

export class AssetMetadataService {
	constructor(
		private readonly mutations: AssetMutations,
		private readonly storage: AssetStorageService,
	) {}

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
		return this.mutations.run(
			actor,
			projectId,
			"UPDATE_ASSET",
			`/assets/${assetId}`,
			key,
			input,
			assetMetadataResponseSchema,
			async (tx, project) => {
				const asset = await findProjectAsset(tx, projectId, assetId, actor);
				if (!["READY", "UNVERIFIED"].includes(asset.status))
					throw new AssetError(
						409,
						"ASSET_NOT_READY",
						"The asset cannot be changed in its current state.",
						{ state: asset.status },
					);
				if (
					input.expectedVersion !== undefined &&
					asset.version !== input.expectedVersion
				)
					throw new AssetError(
						409,
						"VERSION_CONFLICT",
						"Read the current asset before updating it.",
					);
				if (input.uploadCompleted) {
					requireActiveProject(project);
					await completeAssetUpload(tx, this.storage, projectId, assetId);
				}
				const data: Prisma.ArtifactUpdateInput = {};
				if (input.fileName !== undefined) data.fileName = input.fileName;
				if (input.kind !== undefined) {
					data.kind = input.kind;
					data.type = input.kind;
				}
				if (input.fileName === undefined && input.kind === undefined)
					return { asset: assetResponse(asset) };
				const updated = await tx.artifact.update({
					where: { id: assetId },
					data: { ...data, updatedAt: new Date(), version: { increment: 1 } },
					include: { deal: { select: { companyId: true } } },
				});
				return { asset: assetResponse(updated) };
			},
			{ assetId },
		);
	}
}
