import { z } from "zod";

const jsonValueSchema = z.json();
type JsonValue = z.infer<typeof jsonValueSchema>;
type ResponseSchema<T> = { parse: (value: JsonValue) => T };

export type ApiErrorDetails = {
	state?: string;
	maxBytes?: number;
	fields?: { field: string; message: string }[];
};

export class ProjectAssetsApiError extends Error {
	readonly code: string;
	readonly status: number;
	readonly retryable: boolean;
	readonly details?: ApiErrorDetails;

	constructor(
		message: string,
		status: number,
		code: string,
		retryable = false,
		details?: ApiErrorDetails,
	) {
		super(message);
		this.name = "ProjectAssetsApiError";
		this.status = status;
		this.code = code;
		this.retryable = retryable;
		this.details = details;
	}
}

type RequestOptions = Omit<RequestInit, "body"> & {
	body?: unknown;
	idempotencyKey?: string;
};

export function operationKey(): string {
	return crypto.randomUUID();
}

function proxyPath(path: string): string {
	return path.startsWith("/api/") ? path : `/api${path}`;
}

export async function request<T>(
	path: string,
	schema: ResponseSchema<T>,
	options: RequestOptions = {},
): Promise<T> {
	const headers = new Headers(options.headers);
	headers.set("Accept", "application/json");
	const method = options.method ?? "GET";
	if (options.body !== undefined)
		headers.set("Content-Type", "application/json");
	if (["POST", "PATCH", "DELETE"].includes(method)) {
		if (!options.idempotencyKey)
			throw new Error("A mutation needs an idempotency key.");
		headers.set("Idempotency-Key", options.idempotencyKey);
	}
	const response = await fetch(proxyPath(path), {
		...options,
		method,
		headers,
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
		credentials: "same-origin",
	});
	const raw = await response.text();
	const parsed: JsonValue = raw ? parseJsonValue(raw) : null;
	if (!response.ok) throw parseApiError(response.status, parsed);
	return schema.parse(parsed);
}

function parseJsonValue(text: string): JsonValue {
	try {
		const parsed = jsonValueSchema.safeParse(JSON.parse(text));
		return parsed.success ? parsed.data : text;
	} catch {
		return text;
	}
}

function parseApiError(status: number, raw: JsonValue): ProjectAssetsApiError {
	const parsed = z
		.object({
			error: z.object({
				code: z.string(),
				message: z.string(),
				retryable: z.boolean().optional(),
				details: z
					.object({
						state: z.string().optional(),
						maxBytes: z.number().optional(),
						fields: z
							.array(z.object({ field: z.string(), message: z.string() }))
							.optional(),
					})
					.optional(),
			}),
		})
		.safeParse(raw);
	if (parsed.success) {
		return new ProjectAssetsApiError(
			parsed.data.error.message,
			status,
			parsed.data.error.code,
			parsed.data.error.retryable ?? false,
			parsed.data.error.details,
		);
	}
	const message = z.string().safeParse(raw).data ?? "The operation failed.";
	return new ProjectAssetsApiError(message, status, "REQUEST_FAILED");
}

export function query(
	filters: Record<string, string | number | boolean | undefined>,
) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(filters)) {
		if (value !== undefined && value !== "") params.set(key, String(value));
	}
	return params.toString();
}

export function projectPath(projectId: string, resource: string) {
	return `/projects/${encodeURIComponent(projectId)}/${resource}`;
}
