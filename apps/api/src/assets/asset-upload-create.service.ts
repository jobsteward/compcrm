import { randomUUID } from "node:crypto";
import {
	missing,
	requireActiveProject,
	validateUploadActivity,
} from "./asset-access.service";
import { type AssetActor, assetActorKey } from "./asset-actor";
import { ASSETS } from "./asset-config";
import { AssetError } from "./asset-error";
import { AssetMutations, hashAssetRequest } from "./asset-mutation.service";
import type { AssetStorageService } from "./asset-storage.service";
import { createAssetStorageKeys } from "./asset-storage-keys";
import {
	renewUploadGrant,
	requireAssetStorage,
	uploadGrant,
} from "./asset-upload-grants.service";
import { resolveUploadSource } from "./asset-upload-source.service";
import {
	type CreateUploadInput,
	createUploadInput,
	uploadGrantSchema,
} from "./assets.contracts";

export class AssetUploadCreation {
	constructor(
		private readonly mutations: AssetMutations,
		private readonly storage: AssetStorageService,
	) {}

	async createUpload(
		actor: AssetActor,
		projectId: string,
		raw: CreateUploadInput,
		key: string,
	) {
		const parsed = createUploadInput.safeParse(raw);
		if (!parsed.success)
			throw new AssetError(
				400,
				"VALIDATION_ERROR",
				"Upload metadata is invalid.",
			);
		const input = parsed.data;
		if (
			actor.type === "SYSTEM" &&
			(input.source !== "EMAIL_ATTACHMENT" ||
				input.emailSource?.messageId !== actor.messageId)
		)
			missing();
		const metadata = {
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
			kind: input.kind,
			source: input.source,
			activityId: input.activityId ?? null,
			durationMilliseconds: input.durationMilliseconds ?? null,
			capturedAt: input.capturedAt
				? new Date(input.capturedAt).toISOString()
				: null,
			emailSource: input.emailSource ?? null,
		};
		return this.mutations.run(
			actor,
			projectId,
			"CREATE_UPLOAD",
			`/projects/${projectId}/asset-uploads`,
			key,
			metadata,
			uploadGrantSchema,
			async (tx, project) => {
				requireActiveProject(project);
				if (input.sizeBytes > ASSETS.maxSingleUploadBytes)
					throw new AssetError(
						413,
						"UPLOAD_TOO_LARGE",
						"The file exceeds the single-upload limit.",
						{ maxBytes: ASSETS.maxSingleUploadBytes },
					);
				await validateUploadActivity(tx, projectId, input.activityId);
				const metadataHash = hashAssetRequest(metadata);
				const { mailboxOwnerId, existing } = await resolveUploadSource(
					tx,
					projectId,
					project,
					input,
					metadataHash,
				);
				if (existing)
					return existing.status === "PENDING"
						? renewUploadGrant(this.storage, tx, existing)
						: uploadGrant(this.storage, existing);
				requireAssetStorage(this.storage);
				const actorKey = assetActorKey(actor);
				const count = await tx.assetUpload.count({
					where: { actorKey, reservationReleasedAt: null },
				});
				if (count >= ASSETS.reservationLimit)
					throw new AssetError(
						429,
						"UPLOAD_CAPACITY_EXCEEDED",
						"Temporary upload capacity is full.",
						undefined,
						true,
					);
				const id = randomUUID();
				const expiresAt = new Date(Date.now() + ASSETS.intentMs);
				const grantExpiresAt = new Date(
					Math.min(Date.now() + ASSETS.uploadUrlMs, expiresAt.getTime()),
				);
				const upload = await tx.assetUpload.create({
					data: {
						id,
						projectId,
						customerId: project.companyId,
						actorKey,
						uploadedById: actor.type === "USER" ? actor.userId : null,
						mailboxOwnerId,
						fileName: input.fileName,
						contentType: input.contentType,
						sizeBytes: BigInt(input.sizeBytes),
						kind: input.kind,
						source: input.source,
						activityId: input.activityId,
						durationMilliseconds:
							input.durationMilliseconds == null
								? null
								: BigInt(input.durationMilliseconds),
						capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
						emailMessageId: input.emailSource?.messageId,
						emailAttachmentId: input.emailSource?.attachmentId,
						metadataHash,
						bucket: this.storage.bucket(),
						...createAssetStorageKeys({
							organizationId: project.organizationId,
							projectId: project.id,
							uploadId: id,
							objectId: randomUUID(),
						}),
						expiresAt,
						grantExpiresAt,
						reservationUntil: new Date(
							grantExpiresAt.getTime() + ASSETS.temporaryRetentionMs,
						),
					},
				});
				if (input.emailSource)
					await tx.assetEmailSource.upsert({
						where: { messageId_attachmentId: input.emailSource },
						create: {
							...input.emailSource,
							projectId,
							uploadId: id,
							metadataHash,
							mailboxOwnerId,
						},
						update: { uploadId: id },
					});
				return uploadGrant(this.storage, upload);
			},
			{
				activityId: input.activityId,
				emailMessageId: input.emailSource?.messageId,
			},
		);
	}
}
