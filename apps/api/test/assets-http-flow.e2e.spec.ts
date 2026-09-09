import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AssetError } from "../src/assets/asset-error";
import { AssetStorageService } from "../src/assets/asset-storage.service";
import { AssetsService } from "../src/assets/assets.service";
import { AssetsHttpFixture } from "./assets-http.fixture";

let fixture: AssetsHttpFixture;
let app: AssetsHttpFixture["app"];
let db: AssetsHttpFixture["db"];
let userId: AssetsHttpFixture["userId"];
let projectId: AssetsHttpFixture["projectId"];
let base: AssetsHttpFixture["base"];
let metadata: AssetsHttpFixture["metadata"];

describe("Asset HTTP error handling", () => {
	beforeAll(async () => {
		fixture = new AssetsHttpFixture();
		await fixture.setup();
		app = fixture.app;
		db = fixture.db;
		userId = fixture.userId;
		projectId = fixture.projectId;
		base = fixture.base;
		metadata = fixture.metadata;
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("returns 413 and its exact byte limit without creating an upload", async () => {
		const before = await db.assetUpload.count({ where: { projectId } });
		const response = await request(app.getHttpServer())
			.post(`${base}/asset-uploads`)
			.set("x-asset-test-user", userId)
			.set("Idempotency-Key", randomUUID())
			.send({ ...metadata, sizeBytes: 5363466241 })
			.expect(413);
		expect(response.body.error).toMatchObject({
			code: "UPLOAD_TOO_LARGE",
			retryable: false,
			details: { maxBytes: 5363466240 },
		});
		expect(await db.assetUpload.count({ where: { projectId } })).toBe(before);
	});

	it("returns storage and capacity errors without exposing internal data", async () => {
		const unavailable = spyOn(
			app.get(AssetStorageService),
			"configured",
		).mockReturnValue(false);
		const response = await request(app.getHttpServer())
			.post(`${base}/asset-uploads`)
			.set("x-asset-test-user", userId)
			.set("Idempotency-Key", randomUUID())
			.send(metadata)
			.expect(503);
		expect(response.body.error).toMatchObject({
			code: "STORAGE_UNAVAILABLE",
			retryable: false,
		});
		unavailable.mockReturnValue(true);
		const create = spyOn(
			app.get(AssetsService),
			"createUpload",
		).mockRejectedValueOnce(
			new AssetError(
				429,
				"UPLOAD_CAPACITY_EXCEEDED",
				"Temporary upload capacity is full.",
				undefined,
				true,
			),
		);
		const capacity = await request(app.getHttpServer())
			.post(`${base}/asset-uploads`)
			.set("x-asset-test-user", userId)
			.set("Idempotency-Key", randomUUID())
			.send(metadata)
			.expect(429);
		expect(capacity.body.error).toMatchObject({
			code: "UPLOAD_CAPACITY_EXCEEDED",
			retryable: true,
		});
		expect(capacity.headers["retry-after"]).toBe("60");
		create.mockRejectedValueOnce(new Error("secret provider credential"));
		const failure = await request(app.getHttpServer())
			.post(`${base}/asset-uploads`)
			.set("x-asset-test-user", userId)
			.set("Idempotency-Key", randomUUID())
			.send(metadata)
			.expect(500);
		expect(JSON.stringify(failure.body)).not.toContain(
			"secret provider credential",
		);
		create.mockRestore();
	});
});
