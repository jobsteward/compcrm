import type { AssetStorageJobModel as AssetStorageJob, Db } from "@crm/db";
import { ASSETS } from "./asset-config";
import { AssetStorageService } from "./asset-storage.service";
import {
	completeAssetStorageJob,
	withOwnedAssetStorageJob,
} from "./asset-worker-lease";

export async function removeAssetStorageJob(
	db: Db,
	storage: AssetStorageService,
	job: AssetStorageJob,
	signal: AbortSignal,
) {
	signal.throwIfAborted();
	if (!job.bucket)
		throw new Error("Storage location requires operator resolution.");
	await storage.delete(job.bucket, job.objectKey, signal);
	if (await storage.head(job.bucket, job.objectKey, signal))
		throw new Error("Object deletion remains incomplete.");
	await withOwnedAssetStorageJob(db, job, async (tx) => {
		if (job.temporary && job.uploadId) {
			const upload = await tx.assetUpload.findUnique({
				where: { id: job.uploadId },
			});
			if (upload && upload.reservationUntil > new Date()) {
				await tx.assetStorageJob.update({
					where: { id: job.id },
					data: {
						state: "PENDING",
						nextAttemptAt: new Date(
							Math.min(
								Date.now() + ASSETS.worker.retryMaxMs,
								upload.reservationUntil.getTime(),
							),
						),
						leaseUntil: null,
						leaseToken: null,
						lastError: null,
					},
				});
				return;
			}
			await tx.assetUpload.updateMany({
				where: { id: job.uploadId, reservationReleasedAt: null },
				data: { reservationReleasedAt: new Date() },
			});
		}
		if (job.artifactId)
			await tx.artifact.updateMany({
				where: { id: job.artifactId, status: "DELETING" },
				data: { status: "DELETED", deletedAt: new Date() },
			});
		await completeAssetStorageJob(tx, job);
	});
}
