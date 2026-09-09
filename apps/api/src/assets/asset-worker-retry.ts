import type { AssetStorageJobModel as AssetStorageJob, Db } from "@crm/db";
import { Logger } from "@nestjs/common";
import { ASSETS } from "./asset-config";
import { enqueueAssetObjectDeletion } from "./asset-purge";
import { LeaseLost } from "./asset-worker-errors";
import { withOwnedAssetStorageJob } from "./asset-worker-lease";

export async function retryAssetStorageJob(
	db: Db,
	job: AssetStorageJob,
	verification: boolean,
	logger: Logger,
	interrupted: boolean,
) {
	try {
		await withOwnedAssetStorageJob(db, job, async (tx) => {
			const current = await tx.assetStorageJob.findUniqueOrThrow({
				where: { id: job.id },
			});
			const attempts = current.attempts + (interrupted ? 0 : 1);
			const upload = job.uploadId
				? await tx.assetUpload.findUnique({ where: { id: job.uploadId } })
				: null;
			const terminal =
				job.operation === "FINALIZE_UPLOAD" &&
				(verification ||
					attempts >= ASSETS.worker.maxFinalizeAttempts ||
					!upload?.confirmedAt ||
					Date.now() - upload.confirmedAt.getTime() >=
						ASSETS.worker.finalizeDeadlineMs);
			const message = interrupted
				? "Invocation deadline reached. A retry is scheduled."
				: verification
					? "Stored bytes do not match the upload intent."
					: job.bucket
						? "Storage operation failed. A retry is scheduled."
						: "Storage location requires operator resolution.";
			if (terminal) {
				if (upload?.status === "FINALIZING")
					await tx.assetUpload.update({
						where: { id: upload.id },
						data: {
							status: "FAILED",
							failureCode: verification
								? "UPLOAD_VERIFICATION_FAILED"
								: "UPLOAD_FINALIZATION_FAILED",
							failureMessage: verification
								? message
								: "File finalization failed.",
							completedAt: new Date(),
						},
					});
				if (upload) {
					await enqueueAssetObjectDeletion(tx, {
						projectId: upload.projectId,
						bucket: upload.bucket,
						objectKey: upload.temporaryKey,
						uploadId: upload.id,
						temporary: true,
					});
					await enqueueAssetObjectDeletion(tx, {
						projectId: upload.projectId,
						bucket: upload.bucket,
						objectKey: upload.finalKey,
						uploadId: upload.id,
					});
				}
			}
			await tx.assetStorageJob.update({
				where: { id: job.id },
				data: {
					state: terminal ? "COMPLETE" : "PENDING",
					attempts,
					lastError: message,
					leaseUntil: null,
					leaseToken: null,
					nextAttemptAt: new Date(
						Date.now() +
							Math.min(
								ASSETS.worker.retryMaxMs,
								ASSETS.worker.retryBaseMs *
									2 ** Math.max(0, Math.min(attempts - 1, 30)),
							),
					),
				},
			});
			logger.warn({
				message,
				jobId: job.id,
				operation: job.operation,
				attempts,
			});
		});
	} catch (error) {
		if (!(error instanceof LeaseLost)) throw error;
	}
}
