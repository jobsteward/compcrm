import type { ArtifactModel as Artifact } from "@crm/db";
import { findProjectAsset } from "./asset-access.service";
import type { AssetActor } from "./asset-actor";
import { ASSETS } from "./asset-config";
import { AssetError } from "./asset-error";
import type { AssetMutations } from "./asset-mutation.service";
import { enqueueAssetObjectDeletion } from "./asset-purge";
import type { AssetStorageService } from "./asset-storage.service";
import { assetDeletionSchema, assetDownloadSchema } from "./assets.contracts";

export async function downloadAssetFile(
	storage: AssetStorageService,
	asset: Artifact,
) {
	if (
		asset.status !== "READY" ||
		!asset.storageBucket ||
		asset.sizeBytes === null ||
		!storage.configured()
	)
		return null;
	const expiresAt = new Date(Date.now() + ASSETS.downloadUrlMs);
	try {
		const url = await storage.presignGet(
			asset.storageBucket,
			asset.storageKey,
			asset.fileName,
			asset.contentType,
			expiresAt,
		);
		return assetDownloadSchema.parse({
			url,
			expiresAt: expiresAt.toISOString(),
		});
	} catch (error) {
		if (error instanceof AssetError) throw error;
		throw new AssetError(
			503,
			"STORAGE_UNAVAILABLE",
			"File storage is temporarily unavailable.",
			undefined,
			true,
		);
	}
}

export class AssetFiles {
	constructor(private readonly mutations: AssetMutations) {}

	async deleteAsset(
		actor: AssetActor,
		projectId: string,
		assetId: string,
		key: string,
	) {
		return this.mutations.run(
			actor,
			projectId,
			"DELETE_ASSET",
			`/assets/${assetId}`,
			key,
			{},
			assetDeletionSchema,
			async (tx) => {
				const asset = await findProjectAsset(tx, projectId, assetId, actor);
				if (asset.status === "DELETED") return { assetId, status: "DELETED" };
				await tx.artifact.update({
					where: { id: assetId },
					data: { status: "DELETING" },
				});
				await tx.assetEmailSource.updateMany({
					where: { assetId },
					data: { deletedAt: new Date() },
				});
				const upload = await tx.assetUpload.findUnique({ where: { assetId } });
				if (upload) {
					await tx.assetUpload.updateMany({
						where: { id: upload.id, status: { not: "READY" } },
						data: { status: "CANCELED", completedAt: new Date() },
					});
					await enqueueAssetObjectDeletion(tx, {
						projectId,
						bucket: upload.bucket,
						objectKey: upload.temporaryKey,
						uploadId: upload.id,
						temporary: true,
					});
				}
				await enqueueAssetObjectDeletion(tx, {
					projectId,
					bucket: asset.storageBucket,
					objectKey: asset.storageKey,
					artifactId: assetId,
					uploadId: upload?.id,
				});
				return { assetId, status: "DELETING" };
			},
			{ assetId },
		);
	}
}
