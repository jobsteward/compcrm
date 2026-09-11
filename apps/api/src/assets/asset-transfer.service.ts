import type { Db } from "@crm/db";
import { scopedTransaction } from "@crm/db/tenant-scope";
import {
	findAssetProject,
	findProjectAsset,
	missing,
	requireActiveProject,
} from "./asset-access.service";
import type { AssetActor } from "./asset-actor";
import { ASSETS } from "./asset-config";
import { AssetError } from "./asset-error";
import type { AssetStorageService } from "./asset-storage.service";
import { assetTransferSchema } from "./asset-transfer.contracts";

export function requireAssetStorage(storage: AssetStorageService) {
	if (!storage.configured())
		throw new AssetError(
			503,
			"STORAGE_UNAVAILABLE",
			"File storage is not configured.",
		);
}

export class AssetTransfers {
	constructor(
		private readonly db: Db,
		private readonly storage: AssetStorageService,
	) {}

	async issue(actor: AssetActor, projectId: string, assetId: string) {
		return scopedTransaction(this.db, async (tx) => {
			const project = await findAssetProject(tx, actor, projectId, true);
			const asset = await findProjectAsset(tx, projectId, assetId, actor);
			const upload = await tx.assetUpload.findUnique({ where: { assetId } });
			if (!upload || upload.projectId !== asset.dealId) missing();
			if (
				asset.status !== "UNVERIFIED" ||
				upload.status !== "PENDING" ||
				upload.expiresAt <= new Date()
			)
				return null;
			requireActiveProject(project);
			requireAssetStorage(this.storage);
			const grantExpiresAt = new Date(
				Math.min(Date.now() + ASSETS.uploadUrlMs, upload.expiresAt.getTime()),
			);
			await tx.assetUpload.update({
				where: { id: upload.id },
				data: {
					grantExpiresAt,
					reservationUntil: new Date(
						grantExpiresAt.getTime() + ASSETS.temporaryRetentionMs,
					),
				},
			});
			try {
				const url = await this.storage.presignPut(
					upload.bucket,
					upload.temporaryKey,
					upload.contentType,
					Number(upload.sizeBytes),
					grantExpiresAt,
				);
				return assetTransferSchema.parse({
					method: "PUT",
					url,
					headers: {
						"Content-Type": upload.contentType,
						"Content-Length": upload.sizeBytes.toString(),
					},
					expiresAt: grantExpiresAt.toISOString(),
					maxBytes: ASSETS.maxSingleUploadBytes,
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
		});
	}
}
