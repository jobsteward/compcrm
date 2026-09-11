import { describe, expect, test } from "bun:test";
import { apiProxyPath } from "../lib/api-proxy-path";

describe("API proxy paths", () => {
	test("maps canonical project resources to the API root", () => {
		for (const resource of ["assets", "asset-uploads", "appointments"]) {
			expect(apiProxyPath(`/api/projects/project-1/${resource}`)).toBe(
				`/projects/project-1/${resource}`,
			);
			expect(
				apiProxyPath(`/api/projects/project-1/${resource}/resource-1`),
			).toBe(`/projects/project-1/${resource}/resource-1`);
		}
	});

	test("maps customer asset collections to the API root", () => {
		expect(apiProxyPath("/api/customers/customer-1/assets")).toBe(
			"/customers/customer-1/assets",
		);
	});

	test("preserves unrelated API and near-match paths", () => {
		for (const path of [
			"/api/auth/session",
			"/api/projects/project-1",
			"/api/projects/project-1/assets-extra",
			"/api/projects/project-1/appointments-extra",
			"/api/customers/customer-1/asset-uploads",
			"/projects/project-1/assets",
		]) {
			expect(apiProxyPath(path)).toBe(path);
		}
	});
});
