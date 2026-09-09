import type { Db } from "@crm/db";
import { scopedTransaction } from "@crm/db/tenant-scope";
import { ASSETS } from "./asset-config";
import { enqueueAssetObjectDeletion } from "./asset-purge";

export async function sweepExpiredAssetUploads(db: Db, signal: AbortSignal) {
	if (signal.aborted) return;
	const expired = await scopedTransaction(db, (tx) =>
		tx.assetUpload.findMany({
			where: { status: "PENDING", expiresAt: { lte: new Date() } },
			take: ASSETS.worker.batchSize,
			select: { id: true, projectId: true },
		}),
	);
	for (const candidate of expired) {
		if (signal.aborted) break;
		await scopedTransaction(db, async (tx) => {
			await tx.$queryRaw`SELECT "id" FROM "deal" WHERE "id" = ${candidate.projectId} FOR UPDATE`;
			const upload = await tx.assetUpload.findUnique({
				where: { id: candidate.id },
			});
			if (upload?.status !== "PENDING" || upload.expiresAt > new Date()) return;
			await tx.assetUpload.update({
				where: { id: upload.id },
				data: { status: "EXPIRED", completedAt: new Date() },
			});
			await enqueueAssetObjectDeletion(tx, {
				projectId: upload.projectId,
				bucket: upload.bucket,
				objectKey: upload.temporaryKey,
				uploadId: upload.id,
				temporary: true,
			});
		});
	}
	if (signal.aborted) return;
	await scopedTransaction(
		db,
		(tx) =>
			tx.$executeRaw`DELETE FROM "assetApiRequest" WHERE "id" IN (SELECT "id" FROM "assetApiRequest" WHERE "expiresAt" <= (NOW() AT TIME ZONE 'UTC') LIMIT ${ASSETS.worker.batchSize})`,
	);
}
