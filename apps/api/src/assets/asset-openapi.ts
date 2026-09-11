import type { OpenAPIObject } from "trpc-to-openapi";
import { z } from "zod";
import { type RestMethod, restMeta } from "../trpc/openapi";
import { isProjectResourcePath } from "./asset-public-routes";
import { assetErrorEnvelopeSchema } from "./assets.contracts";

const requestHeaders = z.object({
	"X-Request-Id": z.string().max(128).optional(),
});
const mutationHeaders = requestHeaders.extend({
	"Idempotency-Key": z
		.string()
		.min(1)
		.max(128)
		.regex(/^[\x20-\x7e]+$/),
});

export function assetRestMeta(method: RestMethod, path: `/${string}`) {
	const meta = restMeta(method, path, ["Assets"]);
	if (meta.openapi) {
		meta.openapi.requestHeaders =
			method === "GET" ? requestHeaders : mutationHeaders;
		meta.openapi.responseHeaders = z.object({
			"Cache-Control": z.literal("private, no-store"),
			"X-Request-Id": z.string(),
		});
		meta.openapi.errorResponses = [400, 401, 403, 404, 409, 413, 429, 500, 503];
	}
	return meta;
}

export const assetRoutes = {
	createProjectAsset: assetRestMeta("POST", "/projects/{projectId}/assets"),
	createAppointmentAsset: assetRestMeta(
		"POST",
		"/appointments/{appointmentId}/assets",
	),
	listProjectAssets: assetRestMeta("GET", "/projects/{projectId}/assets"),
	listAppointmentAssets: assetRestMeta(
		"GET",
		"/appointments/{appointmentId}/assets",
	),
	getAsset: assetRestMeta("GET", "/assets/{assetId}"),
	updateAsset: assetRestMeta("PATCH", "/assets/{assetId}"),
	deleteAsset: assetRestMeta("DELETE", "/assets/{assetId}"),
};

export function describeAssetErrors(document: OpenAPIObject): void {
	for (const [path, methods] of Object.entries(document.paths ?? {})) {
		if (!isProjectResourcePath(path)) continue;
		for (const method of ["get", "post", "patch", "delete"] as const) {
			const responses = methods[method]?.responses;
			if (!responses) continue;
			for (const [status, response] of Object.entries(responses)) {
				if (Number(status) < 400 || "$ref" in response) continue;
				response.content = {
					"application/json": {
						schema: z.toJSONSchema(assetErrorEnvelopeSchema),
					},
				};
			}
		}
	}
}
