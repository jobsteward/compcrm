import { z } from "zod";
import { AssetError } from "./asset-error";

const s3ErrorSchema = z.object({
	$metadata: z
		.object({ httpStatusCode: z.number().int().optional() })
		.optional(),
	Code: z.string().optional(),
	code: z.string().optional(),
	name: z.string().optional(),
	statusCode: z.number().int().optional(),
});

type S3Error = z.infer<typeof s3ErrorSchema>;

export function parseS3Error(cause: unknown): S3Error {
	const parsed = s3ErrorSchema.safeParse(cause);
	return parsed.success ? parsed.data : {};
}

export function isNotFound(error: S3Error): boolean {
	const status = statusCode(error);
	const name = errorName(error);
	return (
		status === 404 ||
		name === "NotFound" ||
		name === "NoSuchKey" ||
		name === "NoSuchObject"
	);
}

export function isPreconditionFailure(error: S3Error): boolean {
	const status = statusCode(error);
	const name = errorName(error);
	return status === 412 || name === "PreconditionFailed";
}

export function storageError(error: S3Error): AssetError {
	const status = statusCode(error);
	const retryable = status === undefined || status >= 500 || status === 429;
	return new AssetError(
		503,
		"STORAGE_UNAVAILABLE",
		"Object storage request failed.",
		undefined,
		retryable,
	);
}

function statusCode(error: S3Error): number | undefined {
	return error.$metadata?.httpStatusCode ?? error.statusCode;
}

function errorName(error: S3Error): string | undefined {
	return error.name ?? error.Code ?? error.code;
}
