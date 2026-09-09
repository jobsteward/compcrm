import {
	CopyObjectCommand,
	DeleteObjectCommand,
	HeadObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { AssetError } from "./asset-error";
import {
	isNotFound,
	isPreconditionFailure,
	parseS3Error,
	storageError,
} from "./asset-storage-errors";

export type AssetStorageHead = {
	sizeBytes: number;
	etag: string;
	contentType: string | null;
};

export async function headObject(
	client: S3Client,
	bucket: string,
	key: string,
	signal?: AbortSignal,
): Promise<AssetStorageHead | null> {
	try {
		const response = await client.send(
			new HeadObjectCommand({ Bucket: bucket, Key: key }),
			{ abortSignal: signal },
		);
		if (response.ContentLength === undefined || !response.ETag) {
			throw new AssetError(
				503,
				"STORAGE_UNAVAILABLE",
				"Object storage returned incomplete metadata.",
				undefined,
				false,
			);
		}

		return {
			sizeBytes: response.ContentLength,
			etag: response.ETag,
			contentType: response.ContentType ?? null,
		};
	} catch (error) {
		if (error instanceof AssetError) throw error;
		const parsedError = parseS3Error(error);
		if (isNotFound(parsedError)) return null;
		throw storageError(parsedError);
	}
}

export async function copyObject(
	client: S3Client,
	bucket: string,
	sourceKey: string,
	finalKey: string,
	sourceEtag: string,
	signal?: AbortSignal,
): Promise<void> {
	try {
		await client.send(
			new CopyObjectCommand({
				Bucket: bucket,
				Key: finalKey,
				CopySource: `${bucket}/${sourceKey}`,
				CopySourceIfMatch: sourceEtag,
			}),
			{ abortSignal: signal },
		);
	} catch (error) {
		const parsedError = parseS3Error(error);
		if (isPreconditionFailure(parsedError)) {
			throw new AssetError(
				409,
				"SOURCE_ETAG_MISMATCH",
				"The source object changed before finalization.",
				undefined,
				false,
			);
		}
		throw storageError(parsedError);
	}
}

export async function deleteObject(
	client: S3Client,
	bucket: string,
	key: string,
	signal?: AbortSignal,
): Promise<void> {
	try {
		await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
			abortSignal: signal,
		});
	} catch (error) {
		throw storageError(parseS3Error(error));
	}
}
