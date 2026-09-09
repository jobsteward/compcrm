import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { parseS3Error, storageError } from "./asset-storage-errors";

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

export async function presignPutObject(
	client: S3Client,
	bucket: string,
	key: string,
	contentType: string,
	sizeBytes: number,
	expiresIn: number,
): Promise<string> {
	try {
		return await getSignedUrl(
			client,
			new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				ContentType: contentType || DEFAULT_CONTENT_TYPE,
				ContentLength: sizeBytes,
			}),
			{
				expiresIn,
				signableHeaders: new Set(["content-length", "content-type"]),
			},
		);
	} catch (error) {
		throw storageError(parseS3Error(error));
	}
}

export async function presignGetObject(
	client: S3Client,
	bucket: string,
	key: string,
	fileName: string,
	contentType: string,
	expiresIn: number,
): Promise<string> {
	try {
		return await getSignedUrl(
			client,
			new GetObjectCommand({
				Bucket: bucket,
				Key: key,
				ResponseContentDisposition: contentDisposition(fileName),
				ResponseContentType: contentType || DEFAULT_CONTENT_TYPE,
			}),
			{ expiresIn },
		);
	} catch (error) {
		throw storageError(parseS3Error(error));
	}
}

function contentDisposition(fileName: string): string {
	const fallback =
		fileName
			.normalize("NFKD")
			.replace(/[^\x20-\x7e]/g, "_")
			.replace(/[\\"]/g, "_") || "download";
	const encoded = encodeURIComponent(fileName).replace(
		/[!'()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	);

	return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
