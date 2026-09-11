import { describe, expect, test } from "bun:test";
import { apiProxyPath } from "../lib/api-proxy-path";

describe("API proxy paths", () => {
	test("maps asset collection and member paths to the API root", () => {
		for (const [path, expected] of [
			["/api/projects/project-1/assets", "/projects/project-1/assets"],
			[
				"/api/appointments/appointment-1/assets",
				"/appointments/appointment-1/assets",
			],
			["/api/assets/asset-1", "/assets/asset-1"],
		] as const) {
			expect(apiProxyPath(path)).toBe(expected);
		}
	});

	test("maps the project appointment collection", () => {
		expect(apiProxyPath("/api/projects/project-1/appointments")).toBe(
			"/projects/project-1/appointments",
		);
	});

	test("preserves unrelated API and near-match paths", () => {
		for (const path of [
			"/api/auth/session",
			"/api/projects/project-1",
			"/api/projects/project-1/assets-extra",
			"/api/projects/project-1/appointments-extra",
			"/api/appointments/appointment-1/assets-extra",
			"/api/assets",
			"/api/assets/",
			"/api/customers/customer-1/assets",
			"/projects/project-1/assets",
		]) {
			expect(apiProxyPath(path)).toBe(path);
		}
	});
});
