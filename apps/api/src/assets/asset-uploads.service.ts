import type { Db } from "@crm/db";
import { scopedTransaction } from "@crm/db/tenant-scope";
import {
	findAssetProject,
	findAssetUpload,
	requireActiveProject,
} from "./asset-access.service";
import type { AssetActor } from "./asset-actor";
import type { AssetMutations } from "./asset-mutation.service";
import { enqueueAssetObjectDeletion } from "./asset-purge";
import { assetUploadStatusUrl, uploadResponse } from "./asset-responses";
import type { AssetStorageService } from "./asset-storage.service";
import {
	renewUploadGrant,
	requireAssetStorage,
	requireUploadState,
} from "./asset-upload-grants.service";
import {
	uploadCancellationSchema,
	uploadConfirmationSchema,
	uploadGrantSchema,
} from "./assets.contracts";

export class AssetUploads {
	constructor(
		private readonly db: Db,
		private readonly storage: AssetStorageService,
		private readonly mutations: AssetMutations,
	) {}

	async getUpload(actor: AssetActor, projectId: string, uploadId: string) {
		return scopedTransaction(this.db, async (tx) => {
			await findAssetProject(tx, actor, projectId, true);
			let upload = await findAssetUpload(tx, projectId, uploadId, actor);
			if (upload.status === "PENDING" && upload.expiresAt <= new Date()) {
				upload = await tx.assetUpload.update({
					where: { id: uploadId },
					data: { status: "EXPIRED", completedAt: new Date() },
				});
				await enqueueAssetObjectDeletion(tx, {
					projectId,
					bucket: upload.bucket,
					objectKey: upload.temporaryKey,
					uploadId,
					temporary: true,
				});
			}
			return {
				upload: uploadResponse(upload),
				pollAfterSeconds: upload.status === "FINALIZING" ? 3 : null,
			};
		});
	}

	async renewUpload(
		actor: AssetActor,
		projectId: string,
		uploadId: string,
		key: string,
	) {
		return this.mutations.run(
			actor,
			projectId,
			"RENEW_UPLOAD",
			`/projects/${projectId}/asset-uploads/${uploadId}/url`,
			key,
			{},
			uploadGrantSchema,
			async (tx, project) => {
				requireActiveProject(project);
				const upload = await findAssetUpload(tx, projectId, uploadId, actor);
				requireUploadState(upload, ["PENDING"]);
				return renewUploadGrant(this.storage, tx, upload);
			},
			{ uploadId },
		);
	}

	async confirmUpload(
		actor: AssetActor,
		projectId: string,
		uploadId: string,
		key: string,
	) {
		const response = await this.mutations.run(
			actor,
			projectId,
			"CONFIRM_UPLOAD",
			`/projects/${projectId}/asset-uploads/${uploadId}/confirm`,
			key,
			{},
			uploadConfirmationSchema,
			async (tx, project) => {
				requireActiveProject(project);
				const upload = await findAssetUpload(tx, projectId, uploadId, actor);
				requireUploadState(upload, ["PENDING", "FINALIZING", "READY"]);
				if (upload.status === "PENDING") {
					requireAssetStorage(this.storage);
					await tx.assetUpload.update({
						where: { id: uploadId },
						data: { status: "FINALIZING", confirmedAt: new Date() },
					});
					await tx.assetStorageJob.create({
						data: {
							operationKey: `finalize:${uploadId}`,
							operation: "FINALIZE_UPLOAD",
							nextAttemptAt: new Date(),
							projectId,
							uploadId,
							bucket: upload.bucket,
							objectKey: upload.temporaryKey,
							finalKey: upload.finalKey,
						},
					});
				}
				return {
					uploadId,
					statusUrl: assetUploadStatusUrl(projectId, uploadId),
				};
			},
			{ uploadId },
		);
		return {
			...response,
			statusUrl: assetUploadStatusUrl(projectId, response.uploadId),
		};
	}

	async cancelUpload(
		actor: AssetActor,
		projectId: string,
		uploadId: string,
		key: string,
	) {
		return this.mutations.run(
			actor,
			projectId,
			"CANCEL_UPLOAD",
			`/projects/${projectId}/asset-uploads/${uploadId}`,
			key,
			{},
			uploadCancellationSchema,
			async (tx) => {
				const upload = await findAssetUpload(tx, projectId, uploadId, actor);
				requireUploadState(upload, ["PENDING", "FAILED", "CANCELED"]);
				if (upload.status !== "CANCELED")
					await tx.assetUpload.update({
						where: { id: uploadId },
						data: { status: "CANCELED", completedAt: new Date() },
					});
				await enqueueAssetObjectDeletion(tx, {
					projectId,
					bucket: upload.bucket,
					objectKey: upload.temporaryKey,
					uploadId,
					temporary: true,
				});
				return { uploadId, status: "CANCELED" };
			},
			{ uploadId },
		);
	}
}
