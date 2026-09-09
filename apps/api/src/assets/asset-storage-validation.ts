import { ASSETS } from "./asset-config";
import { AssetError } from "./asset-error";

export function validateUploadSize(sizeBytes: number): void {
	if (
		!Number.isSafeInteger(sizeBytes) ||
		sizeBytes < 0 ||
		sizeBytes > ASSETS.maxSingleUploadBytes
	) {
		throw new AssetError(
			413,
			"UPLOAD_TOO_LARGE",
			"The file exceeds the single-upload limit.",
			{ maxBytes: ASSETS.maxSingleUploadBytes },
			false,
		);
	}
}

export function expiresInSeconds(expiresAt: Date): number {
	const remainingMs = expiresAt.getTime() - Date.now();
	const seconds = Math.ceil(remainingMs / 1_000);

	if (
		!Number.isFinite(seconds) ||
		seconds < 1 ||
		seconds > ASSETS.maxPresignSeconds
	) {
		throw new AssetError(
			400,
			"INVALID_EXPIRY",
			"The storage grant expiry is invalid.",
			{ maxSeconds: ASSETS.maxPresignSeconds },
			false,
		);
	}

	return seconds;
}
