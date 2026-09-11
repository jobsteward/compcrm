import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { scopedDb } from "@crm/db/tenant-scope";
import request from "supertest";
import { AssetsHttpFixture } from "./assets-http.fixture";
import { inAssetTenant } from "./assets-tenant.fixture";

describe("canonical project asset HTTP routes", () => {
	const fixture = new AssetsHttpFixture();
	const publicBase = `/projects/${fixture.projectId}`;
	beforeAll(() => fixture.setup());
	afterAll(() => fixture.cleanup());

	it("shares upload identity across canonical and retained paths", async () => {
		const key = randomUUID();
		const create = (base: string) =>
			request(fixture.app.getHttpServer())
				.post(`${base}/asset-uploads`)
				.set("x-asset-test-user", fixture.userId)
				.set("Idempotency-Key", key)
				.send(fixture.metadata)
				.expect(200);
		const first = await create(fixture.base);
		const replay = await create(publicBase);
		expect(replay.body).toEqual(first.body);
		expect(replay.headers["cache-control"]).toBe("private, no-store");
		const uploadId = first.body.upload.id;
		const confirmKey = randomUUID();
		const confirm = (base: string) =>
			request(fixture.app.getHttpServer())
				.post(`${base}/asset-uploads/${uploadId}/confirm`)
				.set("x-asset-test-user", fixture.userId)
				.set("Idempotency-Key", confirmKey)
				.send({})
				.expect(200);
		await confirm(fixture.base);
		await inAssetTenant(() =>
			scopedDb.assetApiRequest.updateMany({
				where: {
					actorKey: `user:${fixture.userId}`,
					operation: "CONFIRM_UPLOAD",
					idempotencyKey: confirmKey,
				},
				data: {
					responseBody: {
						uploadId,
						statusUrl: `${fixture.base}/asset-uploads/${uploadId}`,
					},
				},
			}),
		);
		const confirmation = await confirm(publicBase);
		expect(confirmation.body).toEqual({
			uploadId,
			statusUrl: `${publicBase}/asset-uploads/${uploadId}`,
		});
		for (const path of [
			confirmation.body.statusUrl,
			`${fixture.base}/asset-uploads/${uploadId}`,
		]) {
			const status = await request(fixture.app.getHttpServer())
				.get(path)
				.set("x-asset-test-user", fixture.userId)
				.expect(200);
			expect(status.body.upload.id).toBe(uploadId);
		}
	});

	it("retains customer query filters and rejects path overrides on both families", async () => {
		for (const prefix of ["", "/rest/v1"]) {
			await request(fixture.app.getHttpServer())
				.get(
					`${prefix}/customers/${fixture.customerId}/assets?projectId=${fixture.projectId}&pageSize=1`,
				)
				.set("x-asset-test-user", fixture.userId)
				.expect(200);
			for (const suffix of [
				"?projectId=other",
				"?assetId=other",
				"?customerId=other",
				"?appointmentId=other",
			]) {
				const response = await request(fixture.app.getHttpServer())
					.get(`${prefix}${publicBase}/assets${suffix}`)
					.set("x-asset-test-user", fixture.userId)
					.expect(400);
				expect(response.body.error.code).toBe("VALIDATION_ERROR");
			}
		}
	});

	it("does not publish a third REST resource family", async () => {
		for (const resource of ["assets", "appointments"]) {
			await request(fixture.app.getHttpServer())
				.get(`/rest${publicBase}/${resource}`)
				.set("x-asset-test-user", fixture.userId)
				.expect(404);
		}
	});

	it("edits unverified metadata through both paths without granting file access", async () => {
		const asset = await inAssetTenant(() =>
			scopedDb.artifact.create({
				data: {
					dealId: fixture.projectId,
					type: "file",
					fileName: "legacy.txt",
					storageKey: `${fixture.prefix}-legacy`,
				},
			}),
		);
		const key = randomUUID();
		const update = (
			base: string,
			body: {
				expectedVersion: number | string;
				fileName?: string;
				kind?: string;
				projectId?: string;
				sizeBytes?: number;
			},
			identity = key,
		) =>
			request(fixture.app.getHttpServer())
				.patch(`${base}/assets/${asset.id}`)
				.set("x-asset-test-user", fixture.userId)
				.set("Idempotency-Key", identity)
				.send(body);
		const body = {
			expectedVersion: 1,
			fileName: "site-notes.txt",
			kind: "document",
		};
		const first = await update(publicBase, body).expect(200);
		expect(first.body.asset).toMatchObject({
			id: asset.id,
			version: 2,
			status: "UNVERIFIED",
			kind: "document",
			fileName: "site-notes.txt",
		});
		expect((await update(fixture.base, body).expect(200)).body).toEqual(
			first.body,
		);
		for (const base of [publicBase, fixture.base]) {
			for (const invalid of [
				{ expectedVersion: "2", kind: "photo" },
				{ expectedVersion: 2, projectId: "other", kind: "photo" },
				{ expectedVersion: 2, sizeBytes: 0 },
				{ expectedVersion: 2 },
			])
				await update(base, invalid, randomUUID()).expect(400);
			const unavailable = await request(fixture.app.getHttpServer())
				.get(`${base}/assets/${asset.id}/download`)
				.set("x-asset-test-user", fixture.userId)
				.expect(409);
			expect(unavailable.body.error.code).toBe("ASSET_NOT_READY");
		}
	});
});
