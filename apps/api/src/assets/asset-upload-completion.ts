import type { Prisma } from "@crm/db";
import { missing } from "./asset-access.service";
import { AssetError } from "./asset-error";
import type { AssetStorageService } from "./asset-storage.service";
import { requireAssetStorage } from "./asset-transfer.service";

export async function completeAssetUpload(
	tx: Prisma.TransactionClient,
	storage: AssetStorageService,
	projectId: string,
	assetId: string,
) {
	const upload = await tx.assetUpload.findUnique({ where: { assetId } });
	if (!upload || upload.projectId !== projectId) missing();
	if (upload.status === "READY" || upload.status === "FINALIZING") return;
	if (upload.status !== "PENDING" || upload.expiresAt <= new Date())
		throw new AssetError(
			409,
			"ASSET_NOT_READY",
			"The upload no longer accepts completion. Read the asset for its failure.",
		);
	requireAssetStorage(storage);
	await tx.assetUpload.update({
		where: { id: upload.id },
		data: { status: "FINALIZING", confirmedAt: new Date() },
	});
	await tx.assetStorageJob.create({
		data: {
			operationKey: `finalize:${upload.id}`,
			operation: "FINALIZE_UPLOAD",
			nextAttemptAt: new Date(),
			projectId,
			uploadId: upload.id,
			bucket: upload.bucket,
			objectKey: upload.temporaryKey,
			finalKey: upload.finalKey,
		},
	});
}
