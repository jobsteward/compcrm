import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
	missing,
	requireActiveProject,
	validateAssetAppointment,
} from "./asset-access.service";
import { type AssetActor, assetActorKey } from "./asset-actor";
import { ASSETS } from "./asset-config";
import { AssetError } from "./asset-error";
import { AssetMutations, hashAssetRequest } from "./asset-mutation.service";
import type { AssetStorageService } from "./asset-storage.service";
import { createAssetStorageKeys } from "./asset-storage-keys";
import { requireAssetStorage } from "./asset-transfer.service";
import { resolveUploadSource } from "./asset-upload-source.service";
import { type CreateAssetInput, createAssetInput } from "./assets.contracts";

export class AssetCreation {
	constructor(
		private readonly mutations: AssetMutations,
		private readonly storage: AssetStorageService,
	) {}

	async createAsset(
		actor: AssetActor,
		projectId: string,
		raw: CreateAssetInput,
		key: string,
		appointmentId?: string,
	) {
		const parsed = createAssetInput.safeParse(raw);
		if (!parsed.success)
			throw new AssetError(
				400,
				"VALIDATION_ERROR",
				"Asset metadata is invalid.",
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
			appointmentId: appointmentId ?? null,
			durationMilliseconds: input.durationMilliseconds ?? null,
			capturedAt: input.capturedAt
				? new Date(input.capturedAt).toISOString()
				: null,
			emailSource: input.emailSource ?? null,
		};
		return this.mutations.run(
			actor,
			projectId,
			"CREATE_ASSET",
			appointmentId
				? `/appointments/${appointmentId}/assets`
				: `/projects/${projectId}/assets`,
			key,
			metadata,
			z.object({ assetId: z.string() }),
			async (tx, project) => {
				requireActiveProject(project);
				if (input.sizeBytes > ASSETS.maxSingleUploadBytes)
					throw new AssetError(
						413,
						"UPLOAD_TOO_LARGE",
						"The file exceeds the single-upload limit.",
						{ maxBytes: ASSETS.maxSingleUploadBytes },
					);
				if (appointmentId)
					await validateAssetAppointment(tx, projectId, appointmentId);
				const metadataHash = hashAssetRequest(metadata);
				const { mailboxOwnerId, existing } = await resolveUploadSource(
					tx,
					projectId,
					project,
					input,
					metadataHash,
				);
				if (existing) {
					if (!existing.assetId) missing();
					return { assetId: existing.assetId };
				}
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
				const assetId = randomUUID();
				const keys = createAssetStorageKeys({
					organizationId: project.organizationId,
					projectId,
					uploadId: id,
					objectId: randomUUID(),
				});
				const expiresAt = new Date(Date.now() + ASSETS.intentMs);
				const grantExpiresAt = new Date(
					Math.min(Date.now() + ASSETS.uploadUrlMs, expiresAt.getTime()),
				);
				const file = {
					fileName: input.fileName,
					contentType: input.contentType,
					sizeBytes: BigInt(input.sizeBytes),
					kind: input.kind,
					source: input.source,
					activityId: appointmentId ?? null,
					uploadedById: actor.type === "USER" ? actor.userId : null,
					durationMilliseconds:
						input.durationMilliseconds == null
							? null
							: BigInt(input.durationMilliseconds),
					capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
					emailMessageId: input.emailSource?.messageId,
					emailAttachmentId: input.emailSource?.attachmentId,
				};
				await tx.artifact.create({
					data: {
						...file,
						id: assetId,
						dealId: projectId,
						type: input.kind,
						storageBucket: this.storage.bucket(),
						storageKey: keys.finalKey,
						status: "UNVERIFIED",
					},
				});
				await tx.assetUpload.create({
					data: {
						...file,
						id,
						assetId,
						projectId,
						customerId: project.companyId,
						actorKey,
						mailboxOwnerId,
						metadataHash,
						bucket: this.storage.bucket(),
						...keys,
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
							assetId,
							metadataHash,
							mailboxOwnerId,
						},
						update: { uploadId: id, assetId },
					});
				return { assetId };
			},
			{ appointmentId, emailMessageId: input.emailSource?.messageId },
		);
	}
}
