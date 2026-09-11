import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { scopedDb } from "@crm/db/tenant-scope";
import request from "supertest";
import { AssetWorkerService } from "../src/assets/asset-worker.service";
import { AssetsHttpFixture } from "./assets-http.fixture";
import { inAssetTenant } from "./assets-tenant.fixture";

let fixture: AssetsHttpFixture;

describe("Asset HTTP upload lifecycle", () => {
	beforeAll(async () => {
		fixture = new AssetsHttpFixture();
		await fixture.setup();
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("creates, completes, lists, downloads, and deletes an asset", async () => {
		const key = randomUUID();
		const create = () =>
			request(fixture.app.getHttpServer())
				.post(`${fixture.base}/assets`)
				.set("x-asset-test-user", fixture.userId)
				.set("Idempotency-Key", key)
				.send(fixture.metadata);
		const first = await create().expect(200);
		expect(first.body.asset).toMatchObject({
			projectId: fixture.projectId,
			customerId: fixture.customerId,
			status: "UNVERIFIED",
			sizeBytes: fixture.metadata.sizeBytes,
			source: "MANUAL",
			uploadedById: fixture.userId,
		});
		expect(first.body.download).toBeNull();
		expect(first.body.failure).toBeNull();
		expect(first.body.transfer).toMatchObject({
			method: "PUT",
			headers: {
				"Content-Type": "application/octet-stream",
				"Content-Length": "4",
			},
			maxBytes: 5363466240,
		});
		expect(first.body).not.toHaveProperty("upload");
		expect(first.body).not.toHaveProperty("uploadId");

		const assetId = first.body.asset.id as string;
		const replay = await create().expect(200);
		expect(replay.body.asset.id).toBe(assetId);
		expect(replay.body.transfer).not.toBeNull();
		expect(replay.body.transfer.url).not.toBe(first.body.transfer.url);
		expect(
			await inAssetTenant(() =>
				scopedDb.assetUpload.count({ where: { assetId } }),
			),
		).toBe(1);

		await fixture.put(assetId);
		const pending = await request(fixture.app.getHttpServer())
			.get(`/assets/${assetId}`)
			.set("x-asset-test-user", fixture.userId)
			.expect(200);
		expect(pending.body.asset.status).toBe("UNVERIFIED");
		expect(pending.body.download).toBeNull();
		expect(pending.body).not.toHaveProperty("transfer");

		const accepted = await request(fixture.app.getHttpServer())
			.patch(`/assets/${assetId}`)
			.set("x-asset-test-user", fixture.userId)
			.set("Idempotency-Key", randomUUID())
			.send({ uploadCompleted: true })
			.expect(200);
		expect(accepted.body.asset.status).toBe("UNVERIFIED");
		const upload = await fixture.uploadFor(assetId);
		expect(
			await inAssetTenant(() =>
				scopedDb.assetStorageJob.count({ where: { uploadId: upload.id } }),
			),
		).toBe(1);

		const processed = await fixture.app.get(AssetWorkerService).process();
		expect(processed.processed).toBeGreaterThan(0);
		const ready = await request(fixture.app.getHttpServer())
			.get(`/assets/${assetId}`)
			.set("x-asset-test-user", fixture.userId)
			.set("x-asset-test-scope", "crm.read")
			.expect(200);
		expect(ready.body.asset.status).toBe("READY");
		expect(ready.body.download).toMatchObject({
			url: expect.stringContaining(upload.finalKey),
			expiresAt: expect.any(String),
		});
		expect(ready.body).not.toHaveProperty("transfer");

		const listed = await request(fixture.app.getHttpServer())
			.get(`${fixture.base}/assets`)
			.set("x-asset-test-user", fixture.userId)
			.set("x-asset-test-scope", "crm.read")
			.expect(200);
		expect(listed.body.items.map((item: { id: string }) => item.id)).toContain(
			assetId,
		);
		const otherProject = await request(fixture.app.getHttpServer())
			.get(`/projects/${fixture.otherProjectId}/assets`)
			.set("x-asset-test-user", fixture.userId)
			.set("x-asset-test-scope", "crm.read")
			.expect(200);
		expect(
			otherProject.body.items.map((item: { id: string }) => item.id),
		).not.toContain(assetId);

		const deleting = await request(fixture.app.getHttpServer())
			.delete(`/assets/${assetId}`)
			.set("x-asset-test-user", fixture.userId)
			.set("Idempotency-Key", randomUUID())
			.expect(200);
		expect(deleting.body).toEqual({ assetId, status: "DELETING" });
		await request(fixture.app.getHttpServer())
			.get(`/assets/${assetId}`)
			.set("x-asset-test-user", fixture.userId)
			.expect(200)
			.then((response) => {
				expect(response.body.asset.status).toBe("DELETING");
			});
		await fixture.app.get(AssetWorkerService).process();
		const deleted = await request(fixture.app.getHttpServer())
			.get(`/assets/${assetId}`)
			.set("x-asset-test-user", fixture.userId)
			.expect(200);
		expect(deleted.body.asset).toMatchObject({
			status: "DELETED",
			deletedAt: expect.any(String),
		});
		expect(deleted.body.download).toBeNull();
		expect(fixture.objects.has(upload.finalKey)).toBe(false);
	});
});
