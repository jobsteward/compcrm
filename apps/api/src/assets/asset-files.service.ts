import type { Db } from "@crm/db";
import { scopedTransaction } from "@crm/db/tenant-scope";
import { findAssetProject, findProjectAsset } from "./asset-access.service";
import type { AssetActor } from "./asset-actor";
import { ASSETS } from "./asset-config";
import { AssetError } from "./asset-error";
import type { AssetMutations } from "./asset-mutation.service";
import { enqueueAssetObjectDeletion } from "./asset-purge";
import type { AssetStorageService } from "./asset-storage.service";
import { requireAssetStorage } from "./asset-upload-grants.service";
import { assetDeletionSchema, assetDownloadSchema } from "./assets.contracts";

export class AssetFiles {
	constructor(
		private readonly db: Db,
		private readonly storage: AssetStorageService,
		private readonly mutations: AssetMutations,
	) {}

	async downloadAsset(actor: AssetActor, projectId: string, assetId: string) {
		return scopedTransaction(this.db, async (tx) => {
			await findAssetProject(tx, actor, projectId, true);
			const asset = await findProjectAsset(tx, projectId, assetId, actor);
			if (
				asset.status !== "READY" ||
				!asset.storageBucket ||
				asset.sizeBytes === null
			)
				throw new AssetError(
					409,
					"ASSET_NOT_READY",
					"The asset is not available for download.",
					{ state: asset.status },
				);
			requireAssetStorage(this.storage);
			const expiresAt = new Date(Date.now() + ASSETS.downloadUrlMs);
			let url: string;
			try {
				url = await this.storage.presignGet(
					asset.storageBucket,
					asset.storageKey,
					asset.fileName,
					asset.contentType,
					expiresAt,
				);
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
			return assetDownloadSchema.parse({
				assetId,
				url,
				method: "GET",
				headers: {},
				expiresAt: expiresAt.toISOString(),
				fileName: asset.fileName,
				contentType: asset.contentType,
				sizeBytes: Number(asset.sizeBytes),
			});
		});
	}

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
			`/projects/${projectId}/assets/${assetId}`,
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
				await enqueueAssetObjectDeletion(tx, {
					projectId,
					bucket: asset.storageBucket,
					objectKey: asset.storageKey,
					artifactId: assetId,
				});
				return { assetId, status: "DELETING" };
			},
			{ assetId },
		);
	}
}
