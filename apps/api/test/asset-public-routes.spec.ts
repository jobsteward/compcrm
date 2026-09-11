import { describe, expect, it } from "bun:test";
import type { OpenAPIObject } from "trpc-to-openapi";
import {
	canonicalResourcePath,
	describePublicResourcePaths,
	publicResourceBridgeUrl,
} from "../src/assets/asset-public-routes";

describe("public project resource routing", () => {
	it("maps only asset aliases and preserves raw query parameters", () => {
		expect(
			publicResourceBridgeUrl("/projects/p/assets?page=2&kind=a%20b"),
		).toBe("/v1/projects/p/assets?page=2&kind=a%20b");
		expect(publicResourceBridgeUrl("/customers/c/assets?projectId=p")).toBe(
			"/v1/customers/c/assets?projectId=p",
		);
		expect(publicResourceBridgeUrl("/projects/p/appointments?a=1")).toBe(
			"/projects/p/appointments?a=1",
		);
		for (const path of [
			"/projects",
			"/projects/p",
			"/customers/c",
			"/api/auth",
			"/rest/v1/projects/p/assets",
		])
			expect(publicResourceBridgeUrl(path)).toBeNull();
	});

	it("normalizes external and bridge paths for identical validation", () => {
		for (const path of [
			"/rest/v1/customers/c/assets",
			"/v1/customers/c/assets",
			"/customers/c/assets",
		])
			expect(canonicalResourcePath(path)).toBe("/customers/c/assets");
		expect(canonicalResourcePath("/rest/companies/c")).toBe(
			"/rest/companies/c",
		);
	});

	it("publishes canonical paths, deprecated aliases, and actual unrelated paths", () => {
		const document: OpenAPIObject = {
			openapi: "3.1.0",
			info: { title: "Test", version: "1" },
			paths: {
				"/v1/projects/{projectId}/assets": {
					get: { operationId: "assets-list", responses: {} },
				},
				"/projects/{projectId}/appointments": {
					post: { operationId: "appointments-create", responses: {} },
				},
				"/companies/{id}": {
					get: { operationId: "companies-get", responses: {} },
				},
			},
		};
		describePublicResourcePaths(document);
		expect(Object.keys(document.paths ?? {})).toEqual([
			"/projects/{projectId}/assets",
			"/rest/v1/projects/{projectId}/assets",
			"/projects/{projectId}/appointments",
			"/rest/companies/{id}",
		]);
		expect(
			document.paths?.["/rest/v1/projects/{projectId}/assets"]?.get,
		).toMatchObject({ operationId: "assets-listLegacy", deprecated: true });
		expect(
			document.paths?.["/projects/{projectId}/assets"]?.get,
		).not.toHaveProperty("deprecated");
	});
});
