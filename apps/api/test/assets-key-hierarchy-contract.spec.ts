import { describe, expect, it } from "bun:test";
import { createAssetStorageKeys } from "../src/assets/asset-storage-keys";

describe("asset storage key hierarchy", () => {
	it("builds temporary and final keys from the same project prefix", () => {
		expect(
			createAssetStorageKeys({
				organizationId: "org-1",
				projectId: "project-1",
				uploadId: "upload-1",
				objectId: "object-1",
			}),
		).toEqual({
			temporaryKey: "temporary/org-1/projects/project-1/upload-1",
			finalKey: "org-1/projects/project-1/assets/object-1",
		});
	});
});
