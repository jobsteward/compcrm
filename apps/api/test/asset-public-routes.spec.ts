import { describe, expect, it } from "bun:test";
import { isProjectResourcePath } from "../src/assets/asset-public-routes";

describe("public project resource routing", () => {
	it("recognizes root assets and appointments", () => {
		for (const path of [
			"/projects/p/assets",
			"/projects/p/asset-uploads/u/confirm",
			"/customers/c/assets",
			"/projects/p/appointments/a",
		])
			expect(isProjectResourcePath(path)).toBe(true);
	});

	it("excludes removed prefixes and unrelated paths", () => {
		for (const path of [
			"/rest/v1/projects/p/assets",
			"/rest/projects/p/appointments",
			"/v1/customers/c/assets",
			"/companies/c",
			"/projects/p/assets-extra",
			"/api/auth",
		])
			expect(isProjectResourcePath(path)).toBe(false);
	});
});
