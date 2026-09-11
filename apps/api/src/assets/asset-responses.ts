import type { ArtifactModel as Artifact } from "@crm/db";

export function assetResponse(
	asset: Artifact & { deal: { companyId: string } },
) {
	return {
		id: asset.id,
		customerId: asset.deal.companyId,
		projectId: asset.dealId,
		appointmentId: asset.activityId,
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
		updatedAt: asset.updatedAt.toISOString(),
		version: asset.version,
		status: asset.status,
		deletedAt: asset.deletedAt?.toISOString() ?? null,
	};
}
