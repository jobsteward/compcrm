import type { AssetUploadModel as AssetUpload, Prisma } from "@crm/db";
import { ASSETS } from "./asset-config";
import { AssetError } from "./asset-error";
import { uploadResponse } from "./asset-responses";
import type { AssetStorageService } from "./asset-storage.service";
import { uploadGrantSchema } from "./assets.contracts";

export function requireAssetStorage(storage: AssetStorageService) {
	if (!storage.configured())
		throw new AssetError(
			503,
			"STORAGE_UNAVAILABLE",
			"File storage is not configured.",
		);
}

export function requireUploadState(upload: AssetUpload, allowed: string[]) {
	const state =
		upload.status === "PENDING" && upload.expiresAt <= new Date()
			? "EXPIRED"
			: upload.status;
	if (!allowed.includes(state))
		throw new AssetError(
			409,
			"UPLOAD_STATE_CONFLICT",
			"The upload does not permit this action.",
			{ state },
		);
}

export async function uploadGrant(
	storage: AssetStorageService,
	upload: AssetUpload,
) {
	if (upload.status !== "PENDING")
		return uploadGrantSchema.parse({
			upload: uploadResponse(upload),
			transfer: null,
		});
	requireAssetStorage(storage);
	let url: string;
	try {
		url = await storage.presignPut(
			upload.bucket,
			upload.temporaryKey,
			upload.contentType,
			Number(upload.sizeBytes),
			upload.grantExpiresAt,
		);
	} catch (error) {
		if (error instanceof AssetError) throw error;
		throw new AssetError(
			503,
			"STORAGE_UNAVAILABLE",
			"File storage is temporarily unavailable.",
			undefined,
			true,
		);
	}
	return uploadGrantSchema.parse({
		upload: uploadResponse(upload),
		transfer: {
			method: "PUT",
			url,
			headers: {
				"Content-Type": upload.contentType,
				"Content-Length": upload.sizeBytes.toString(),
			},
			expiresAt: upload.grantExpiresAt.toISOString(),
			maxBytes: ASSETS.maxSingleUploadBytes,
		},
	});
}

export async function renewUploadGrant(
	storage: AssetStorageService,
	tx: Prisma.TransactionClient,
	upload: AssetUpload,
) {
	const grantExpiresAt = new Date(
		Math.min(Date.now() + ASSETS.uploadUrlMs, upload.expiresAt.getTime()),
	);
	return uploadGrant(
		storage,
		await tx.assetUpload.update({
			where: { id: upload.id },
			data: {
				grantExpiresAt,
				reservationUntil: new Date(
					grantExpiresAt.getTime() + ASSETS.temporaryRetentionMs,
				),
			},
		}),
	);
}
