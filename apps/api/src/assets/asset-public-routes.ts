import type { OpenAPIObject } from "trpc-to-openapi";

const assetPath =
	/^\/(?:projects|customers)\/[^/]+\/(?:assets|asset-uploads)(?:\/|$)/;
const appointmentPath = /^\/projects\/[^/]+\/appointments(?:\/|$)/;

export function isProjectResourcePath(path: string): boolean {
	return assetPath.test(path) || appointmentPath.test(path);
}

export function canonicalResourcePath(path: string): string {
	return path.replace(/^\/rest\/v1(?=\/)/, "").replace(/^\/v1(?=\/)/, "");
}

export function publicResourceBridgeUrl(url: string): string | null {
	const path = url.split("?")[0] ?? "";
	if (assetPath.test(path)) return `/v1${url}`;
	if (appointmentPath.test(path)) return url;
	return null;
}

export function describePublicResourcePaths(document: OpenAPIObject): void {
	const paths: NonNullable<OpenAPIObject["paths"]> = {};
	for (const [path, methods] of Object.entries(document.paths ?? {})) {
		const canonical = canonicalResourcePath(path);
		if (path.startsWith("/v1/") && assetPath.test(canonical)) {
			paths[canonical] = methods;
			const legacy = structuredClone(methods);
			for (const method of ["get", "post", "patch", "delete"] as const) {
				const operation = legacy[method];
				if (!operation) continue;
				operation.deprecated = true;
				operation.operationId = `${operation.operationId}Legacy`;
			}
			paths[`/rest${path}`] = legacy;
		} else {
			paths[appointmentPath.test(path) ? path : `/rest${path}`] = methods;
		}
	}
	document.paths = paths;
}
