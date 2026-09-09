import type {
	AssetStorageJobModel as AssetStorageJob,
	Db,
	Prisma,
} from "@crm/db";
import { ASSETS } from "./asset-config";
import { enqueueAssetObjectDeletion } from "./asset-purge";
import { AssetStorageService } from "./asset-storage.service";
import {
	FinalizationExpired,
	LeaseLost,
	VerificationFailed,
} from "./asset-worker-errors";
import {
	completeAssetStorageJob,
	withOwnedAssetStorageJob,
} from "./asset-worker-lease";

type Tx = Prisma.TransactionClient;

async function abandonAssetStorageJob(tx: Tx, job: AssetStorageJob) {
	if (job.finalKey) {
		const deletion = await enqueueAssetObjectDeletion(tx, {
			projectId: job.projectId,
			bucket: job.bucket,
			objectKey: job.finalKey,
			uploadId: job.uploadId ?? undefined,
		});
		if (deletion.state === "COMPLETE")
			await tx.assetStorageJob.update({
				where: { id: deletion.id },
				data: { state: "PENDING", nextAttemptAt: new Date() },
			});
	}
	await completeAssetStorageJob(tx, job);
}

export async function finalizeAssetStorageJob(
	db: Db,
	storage: AssetStorageService,
	job: AssetStorageJob,
	signal: AbortSignal,
) {
	signal.throwIfAborted();
	const upload = await withOwnedAssetStorageJob(db, job, async (tx) => {
		const upload = job.uploadId
			? await tx.assetUpload.findUnique({ where: { id: job.uploadId } })
			: null;
		const project = await tx.deal.findUnique({
			where: { id: job.projectId },
			select: { id: true },
		});
		if (upload?.status === "READY") {
			await completeAssetStorageJob(tx, job);
			return null;
		}
		if (!upload || !project || upload.status !== "FINALIZING") {
			await abandonAssetStorageJob(tx, job);
			return null;
		}
		return upload;
	});
	if (!upload) return;
	if (
		!upload.confirmedAt ||
		Date.now() - upload.confirmedAt.getTime() >=
			ASSETS.worker.finalizeDeadlineMs
	)
		throw new FinalizationExpired();
	let sourceEtag = upload.sourceEtag;
	if (!sourceEtag) {
		const source = await storage.head(
			upload.bucket,
			upload.temporaryKey,
			signal,
		);
		if (!source || source.sizeBytes !== Number(upload.sizeBytes))
			throw new VerificationFailed();
		sourceEtag = source.etag;
		await withOwnedAssetStorageJob(db, job, async (tx) => {
			const current = await tx.assetUpload.findUnique({
				where: { id: upload.id },
			});
			if (current?.status !== "FINALIZING") throw new LeaseLost();
			await tx.assetUpload.update({
				where: { id: upload.id },
				data: { sourceEtag },
			});
		});
	}
	let final = await storage.head(upload.bucket, upload.finalKey, signal);
	if (!final) {
		await withOwnedAssetStorageJob(db, job, async (tx) => {
			const current = await tx.assetUpload.findUnique({
				where: { id: upload.id },
			});
			if (current?.status !== "FINALIZING") throw new LeaseLost();
		});
		await storage.copy(
			upload.bucket,
			upload.temporaryKey,
			upload.finalKey,
			sourceEtag,
			signal,
		);
		final = await storage.head(upload.bucket, upload.finalKey, signal);
	}
	if (
		!final ||
		final.sizeBytes !== Number(upload.sizeBytes) ||
		final.etag !== sourceEtag
	)
		throw new VerificationFailed();
	await withOwnedAssetStorageJob(db, job, async (tx) => {
		const current = await tx.assetUpload.findUnique({
			where: { id: upload.id },
		});
		const project = await tx.deal.findUnique({
			where: { id: upload.projectId },
			select: { id: true },
		});
		if (!project || !current || current.status !== "FINALIZING") {
			await abandonAssetStorageJob(tx, job);
			return;
		}
		const asset = await tx.artifact.create({
			data: {
				dealId: upload.projectId,
				type: upload.kind,
				fileName: upload.fileName,
				storageBucket: upload.bucket,
				storageKey: upload.finalKey,
				kind: upload.kind,
				contentType: upload.contentType,
				sizeBytes: upload.sizeBytes,
				source: upload.source,
				activityId: upload.activityId,
				uploadedById: upload.uploadedById,
				durationMilliseconds: upload.durationMilliseconds,
				capturedAt: upload.capturedAt,
				emailMessageId: upload.emailMessageId,
				emailAttachmentId: upload.emailAttachmentId,
				status: "READY",
			},
		});
		await tx.assetUpload.update({
			where: { id: upload.id },
			data: { status: "READY", assetId: asset.id, completedAt: new Date() },
		});
		await tx.assetEmailSource.updateMany({
			where: { uploadId: upload.id },
			data: { assetId: asset.id },
		});
		await enqueueAssetObjectDeletion(tx, {
			projectId: upload.projectId,
			bucket: upload.bucket,
			objectKey: upload.temporaryKey,
			uploadId: upload.id,
			temporary: true,
		});
		await completeAssetStorageJob(tx, job);
	});
}
