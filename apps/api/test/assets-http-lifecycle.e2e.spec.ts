import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { scopedDb } from "@crm/db/tenant-scope";
import request from "supertest";
import { AssetWorkerService } from "../src/assets/asset-worker.service";
import { AssetsHttpFixture } from "./assets-http.fixture";
import { inAssetTenant } from "./assets-tenant.fixture";

let fixture: AssetsHttpFixture;
let app: AssetsHttpFixture["app"];
let userId: AssetsHttpFixture["userId"];
let projectId: AssetsHttpFixture["projectId"];
let otherProjectId: AssetsHttpFixture["otherProjectId"];
let customerId: AssetsHttpFixture["customerId"];
let base: AssetsHttpFixture["base"];
let metadata: AssetsHttpFixture["metadata"];
let objects: AssetsHttpFixture["objects"];

describe("Asset HTTP upload lifecycle", () => {
	beforeAll(async () => {
		fixture = new AssetsHttpFixture();
		await fixture.setup();
		app = fixture.app;
		userId = fixture.userId;
		projectId = fixture.projectId;
		otherProjectId = fixture.otherProjectId;
		customerId = fixture.customerId;
		base = fixture.base;
		metadata = fixture.metadata;
		objects = fixture.objects;
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("completes the upload, renewal, confirmation, listing, download, and deletion flow", async () => {
		const key = randomUUID();
		const create = () =>
			request(app.getHttpServer())
				.post(`${base}/asset-uploads`)
				.set("x-asset-test-user", userId)
				.set("Idempotency-Key", key)
				.send(metadata);
		const first = await create().expect(200);
		const replay = await create().expect(200);
		expect(replay.body).toEqual(first.body);
		const uploadId = first.body.upload.id;
		expect(first.body.transfer.headers).toEqual({
			"Content-Type": "application/octet-stream",
			"Content-Length": "0",
		});
		await request(app.getHttpServer())
			.get(`/projects/${otherProjectId}/asset-uploads/${uploadId}`)
			.set("x-asset-test-user", userId)
			.expect(404);
		await request(app.getHttpServer())
			.post(`${base}/asset-uploads/${uploadId}/url`)
			.set("x-asset-test-user", userId)
			.set("Idempotency-Key", randomUUID())
			.send({})
			.expect(200);
		const stored = await inAssetTenant(() =>
			scopedDb.assetUpload.findUniqueOrThrow({
				where: { id: uploadId },
			}),
		);
		objects.set(stored.temporaryKey, {
			sizeBytes: 0,
			etag: '"empty"',
			contentType: "application/octet-stream",
		});
		const confirmed = await request(app.getHttpServer())
			.post(`${base}/asset-uploads/${uploadId}/confirm`)
			.set("x-asset-test-user", userId)
			.set("Idempotency-Key", randomUUID())
			.send({})
			.expect(200);
		expect(confirmed.body.statusUrl).toBe(
			`/projects/${projectId}/asset-uploads/${uploadId}`,
		);
		const processed = await app.get(AssetWorkerService).process();
		expect(processed.processed).toBeGreaterThan(0);
		expect(
			await inAssetTenant(() =>
				scopedDb.assetStorageJob.findFirst({
					where: { uploadId, operation: "FINALIZE_UPLOAD" },
					select: { state: true, attempts: true, lastError: true },
				}),
			),
		).toMatchObject({ state: "COMPLETE", lastError: null });
		const state = await request(app.getHttpServer())
			.get(confirmed.body.statusUrl)
			.set("x-asset-test-user", userId)
			.expect(200);
		expect(state.body.upload.status).toBe("READY");
		const assetId = state.body.upload.assetId;
		const detail = await request(app.getHttpServer())
			.get(`${base}/assets/${assetId}`)
			.set("x-asset-test-user", userId)
			.expect(200);
		expect(detail.body.asset).toMatchObject({
			id: assetId,
			projectId,
			customerId,
			sizeBytes: 0,
			source: "MANUAL",
			uploadedById: userId,
		});
		expect(detail.body.asset).not.toHaveProperty("storageKey");
		for (const path of [
			`${base}/assets`,
			`/customers/${customerId}/assets?projectId=${projectId}`,
		]) {
			const listed = await request(app.getHttpServer())
				.get(path)
				.set("x-asset-test-user", userId)
				.expect(200);
			expect(
				listed.body.items.map((item: { id: string }) => item.id),
			).toContain(assetId);
		}
		await request(app.getHttpServer())
			.get(`${base}/assets/${assetId}/download`)
			.set("x-asset-test-user", userId)
			.expect(200);
		await request(app.getHttpServer())
			.delete(`${base}/assets/${assetId}`)
			.set("x-asset-test-user", userId)
			.set("Idempotency-Key", randomUUID())
			.expect(200);
		await request(app.getHttpServer())
			.get(`${base}/assets/${assetId}/download`)
			.set("x-asset-test-user", userId)
			.expect(409);
		await app.get(AssetWorkerService).process();
		const deleted = await request(app.getHttpServer())
			.get(`${base}/assets/${assetId}`)
			.set("x-asset-test-user", userId)
			.expect(200);
		expect(deleted.body.asset.status).toBe("DELETED");
		expect(deleted.body.asset.deletedAt).not.toBeNull();
		expect(objects.has(stored.finalKey)).toBe(false);
	});
});
