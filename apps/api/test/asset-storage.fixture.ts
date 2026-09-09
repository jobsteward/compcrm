import { S3Client } from "@aws-sdk/client-s3";

export const r2Keys = [
	"R2_ACCOUNT_ID",
	"R2_ACCESS_KEY_ID",
	"R2_SECRET_ACCESS_KEY",
	"R2_BUCKET",
] as const;

export type ResponseSpec = {
	statusCode: number;
	headers?: Record<string, string>;
	body?: Uint8Array;
};

export type CapturedRequest = {
	method: string;
	path: string;
	headers: Record<string, string>;
	abortSignal?: AbortSignal;
};

export function withR2Environment() {
	const previous: Partial<Record<(typeof r2Keys)[number], string | undefined>> =
		{};
	for (const key of r2Keys) {
		previous[key] = process.env[key];
		process.env[key] =
			key === "R2_ACCOUNT_ID"
				? "account-id"
				: key === "R2_ACCESS_KEY_ID"
					? "access-key"
					: key === "R2_SECRET_ACCESS_KEY"
						? "secret-key"
						: "assets";
	}
	return () => {
		for (const key of r2Keys) {
			const value = previous[key];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	};
}

export function testClient(
	requests: CapturedRequest[],
	responses: ResponseSpec[],
	defaultResponse?: ResponseSpec,
	failure?: Error,
): S3Client {
	const requestHandler = {
		handle: async (
			request: CapturedRequest,
			options: { abortSignal?: AbortSignal },
		) => {
			requests.push({
				method: request.method,
				path: request.path,
				headers: request.headers,
				abortSignal: options.abortSignal,
			});
			if (failure) throw failure;
			const response = responses.shift() ??
				defaultResponse ?? { statusCode: 204 };
			return {
				response: {
					statusCode: response.statusCode,
					headers: response.headers ?? {},
					body: response.body ?? new Uint8Array(),
				},
			};
		},
	};

	return new S3Client({
		region: "auto",
		endpoint: "http://r2.test",
		forcePathStyle: true,
		credentials: { accessKeyId: "access-key", secretAccessKey: "secret-key" },
		maxAttempts: 1,
		requestChecksumCalculation: "WHEN_REQUIRED",
		responseChecksumValidation: "WHEN_REQUIRED",
		requestHandler: requestHandler as never,
	});
}
