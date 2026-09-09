import type {
	ArtifactModel as Artifact,
	AssetUploadModel as AssetUpload,
} from "@crm/db";

export function uploadResponse(upload: AssetUpload) {
	return {
		id: upload.id,
		customerId: upload.customerId,
		projectId: upload.projectId,
		status: upload.status,
		expiresAt: upload.expiresAt.toISOString(),
		assetId: upload.assetId,
		failure: upload.failureCode
			? {
					code: upload.failureCode,
					message: upload.failureMessage ?? "File finalization failed.",
				}
			: null,
	};
}

export function assetResponse(
	asset: Artifact & { deal: { companyId: string } },
) {
	return {
		id: asset.id,
		customerId: asset.deal.companyId,
		projectId: asset.dealId,
		activityId: asset.activityId,
		fileName: asset.fileName,
		contentType: asset.contentType,
		sizeBytes: asset.sizeBytes === null ? null : Number(asset.sizeBytes),
		kind: asset.kind,
		source: asset.source,
		emailSource:
			asset.emailMessageId && asset.emailAttachmentId
				? {
						messageId: asset.emailMessageId,
						attachmentId: asset.emailAttachmentId,
					}
				: null,
		uploadedById: asset.uploadedById,
		durationMilliseconds:
			asset.durationMilliseconds === null
				? null
				: Number(asset.durationMilliseconds),
		capturedAt: asset.capturedAt?.toISOString() ?? null,
		createdAt: asset.createdAt.toISOString(),
		status: asset.status,
		deletedAt: asset.deletedAt?.toISOString() ?? null,
	};
}
