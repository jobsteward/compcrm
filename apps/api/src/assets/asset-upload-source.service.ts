import type { Prisma } from "@crm/db";
import { missing } from "./asset-access.service";
import { AssetError } from "./asset-error";
import { enqueueAssetObjectDeletion } from "./asset-purge";
import type { CreateUploadInput } from "./assets.contracts";

export async function resolveUploadSource(
	tx: Prisma.TransactionClient,
	projectId: string,
	project: { companyId: string },
	input: CreateUploadInput,
	metadataHash: string,
) {
	let mailboxOwnerId: string | null = null;
	if (input.emailSource) {
		const message = await tx.emailMessage.findUnique({
			where: { id: input.emailSource.messageId },
			include: { thread: true },
		});
		if (!message) missing();
		if (
			message.thread.companyId &&
			message.thread.companyId !== project.companyId
		)
			throw new AssetError(
				409,
				"PROJECT_MISMATCH",
				"The email belongs to another customer.",
			);
		mailboxOwnerId = message.syncedByUserId;
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`source:${input.emailSource.messageId}:${input.emailSource.attachmentId}`}, 0))`;
		const source = await tx.assetEmailSource.findUnique({
			where: { messageId_attachmentId: input.emailSource },
		});
		if (source) {
			if (source.projectId !== projectId)
				throw new AssetError(
					409,
					"PROJECT_MISMATCH",
					"The attachment belongs to another project.",
				);
			if (source.deletedAt)
				throw new AssetError(
					409,
					"SOURCE_DELETED",
					"The source attachment was deleted.",
				);
			if (source.metadataHash !== metadataHash)
				throw new AssetError(
					409,
					"SOURCE_CONFLICT",
					"The source attachment has different metadata.",
				);
			const existing = await tx.assetUpload.findUnique({
				where: { id: source.uploadId },
			});
			if (
				existing &&
				["PENDING", "FINALIZING", "READY"].includes(existing.status) &&
				!(existing.status === "PENDING" && existing.expiresAt <= new Date())
			)
				return { mailboxOwnerId, existing };
			if (existing?.status === "PENDING") {
				await tx.assetUpload.update({
					where: { id: existing.id },
					data: { status: "EXPIRED", completedAt: new Date() },
				});
				await enqueueAssetObjectDeletion(tx, {
					projectId,
					bucket: existing.bucket,
					objectKey: existing.temporaryKey,
					uploadId: existing.id,
					temporary: true,
				});
			}
		}
	}
	return { mailboxOwnerId, existing: null };
}
