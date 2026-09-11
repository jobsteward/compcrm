import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { randomUUID } from "node:crypto";
import { scopedDb } from "@crm/db/tenant-scope";
import request from "supertest";
import { AssetError } from "../src/assets/asset-error";
import { AssetStorageService } from "../src/assets/asset-storage.service";
import { AssetsService } from "../src/assets/assets.service";
import { AssetsHttpFixture } from "./assets-http.fixture";
import { inAssetTenant } from "./assets-tenant.fixture";

let fixture: AssetsHttpFixture;

describe("Asset HTTP error handling", () => {
	beforeAll(async () => {
		fixture = new AssetsHttpFixture();
		await fixture.setup();
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("returns 413 and its exact byte limit without creating an asset", async () => {
		const before = await inAssetTenant(() =>
			scopedDb.assetUpload.count({ where: { projectId: fixture.projectId } }),
		);
		const response = await request(fixture.app.getHttpServer())
			.post(`${fixture.base}/assets`)
			.set("x-asset-test-user", fixture.userId)
			.set("Idempotency-Key", randomUUID())
			.send({ ...fixture.metadata, sizeBytes: 5363466241 })
			.expect(413);
		expect(response.body.error).toMatchObject({
			code: "UPLOAD_TOO_LARGE",
			retryable: false,
			details: { maxBytes: 5363466240 },
		});
		expect(
			await inAssetTenant(() =>
				scopedDb.assetUpload.count({ where: { projectId: fixture.projectId } }),
			),
		).toBe(before);
	});

	it("returns storage and capacity errors without exposing internal data", async () => {
		const unavailable = spyOn(
			fixture.app.get(AssetStorageService),
			"configured",
		).mockReturnValue(false);
		const response = await request(fixture.app.getHttpServer())
			.post(`${fixture.base}/assets`)
			.set("x-asset-test-user", fixture.userId)
			.set("Idempotency-Key", randomUUID())
			.send(fixture.metadata)
			.expect(503);
		expect(response.body.error).toMatchObject({
			code: "STORAGE_UNAVAILABLE",
			retryable: false,
		});
		unavailable.mockReturnValue(true);

		const create = spyOn(
			fixture.app.get(AssetsService),
			"createProjectAsset",
		).mockRejectedValueOnce(
			new AssetError(
				429,
				"UPLOAD_CAPACITY_EXCEEDED",
				"Temporary upload capacity is full.",
				undefined,
				true,
			),
		);
		const capacity = await request(fixture.app.getHttpServer())
			.post(`${fixture.base}/assets`)
			.set("x-asset-test-user", fixture.userId)
			.set("Idempotency-Key", randomUUID())
			.send(fixture.metadata)
			.expect(429);
		expect(capacity.body.error).toMatchObject({
			code: "UPLOAD_CAPACITY_EXCEEDED",
			retryable: true,
		});
		expect(capacity.headers["retry-after"]).toBe("60");

		create.mockRejectedValueOnce(new Error("secret provider credential"));
		const failure = await request(fixture.app.getHttpServer())
			.post(`${fixture.base}/assets`)
			.set("x-asset-test-user", fixture.userId)
			.set("Idempotency-Key", randomUUID())
			.send(fixture.metadata)
			.expect(500);
		expect(JSON.stringify(failure.body)).not.toContain(
			"secret provider credential",
		);
		create.mockRestore();
		unavailable.mockRestore();
	});
});
