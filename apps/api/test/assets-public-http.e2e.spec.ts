import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { scopedDb } from "@crm/db/tenant-scope";
import request from "supertest";
import { AssetsHttpFixture } from "./assets-http.fixture";
import { inAssetTenant } from "./assets-tenant.fixture";

describe("canonical asset HTTP routes", () => {
	const fixture = new AssetsHttpFixture();

	beforeAll(() => fixture.setup());
	afterAll(() => fixture.cleanup());

	it("rejects workflow, customer, nested member, and compatibility paths", async () => {
		for (const path of [
			`${fixture.base}/asset-uploads`,
			`${fixture.base}/asset-uploads/missing`,
			`${fixture.base}/assets/missing`,
			`/customers/${fixture.customerId}/assets`,
			`/rest${fixture.base}/assets`,
			`/rest/v1${fixture.base}/assets`,
			`/v1${fixture.base}/assets`,
		])
			await request(fixture.app.getHttpServer()).get(path).expect(404);
	});

	it("rejects path identifiers in query strings and mutation bodies", async () => {
		for (const path of [
			`${fixture.base}/assets?unknown=1`,
			`${fixture.base}/assets?projectId=${fixture.otherProjectId}`,
			"/appointments/missing/assets?appointmentId=other",
			"/assets/missing?assetId=other",
		]) {
			const response = await request(fixture.app.getHttpServer())
				.get(path)
				.set("x-asset-test-user", fixture.userId)
				.expect(400);
			expect(response.body.error.code).toBe("VALIDATION_ERROR");
		}
		for (const [path, body] of [
			[
				`${fixture.base}/assets`,
				{ ...fixture.metadata, projectId: fixture.otherProjectId },
			],
			[
				"/appointments/missing/assets",
				{ ...fixture.metadata, appointmentId: "other" },
			],
		] as const) {
			const response = await request(fixture.app.getHttpServer())
				.post(path)
				.set("x-asset-test-user", fixture.userId)
				.set("Idempotency-Key", randomUUID())
				.send(body);
			expect(response.status).toBe(400);
			expect(response.body.error.code).toBe("VALIDATION_ERROR");
		}
		const patch = await request(fixture.app.getHttpServer())
			.patch("/assets/missing")
			.set("x-asset-test-user", fixture.userId)
			.set("Idempotency-Key", randomUUID())
			.send({ uploadCompleted: true, appointmentId: "other" })
			.expect(400);
		expect(patch.body.error.code).toBe("VALIDATION_ERROR");
	});

	it("keeps asset member reads tenant-scoped and private", async () => {
		const created = await request(fixture.app.getHttpServer())
			.post(`${fixture.base}/assets`)
			.set("x-asset-test-user", fixture.userId)
			.set("Idempotency-Key", randomUUID())
			.send(fixture.metadata)
			.expect(200);
		const response = await request(fixture.app.getHttpServer())
			.get(`/assets/${created.body.asset.id}`)
			.set("x-asset-test-user", fixture.foreignUserId)
			.set("X-Request-Id", "foreign-asset-test")
			.expect(404);
		expect(response.body).toEqual({
			error: {
				code: "RESOURCE_NOT_FOUND",
				message: "The record does not exist or is inaccessible.",
				requestId: "foreign-asset-test",
				retryable: false,
			},
		});
		expect(response.headers["cache-control"]).toBe("private, no-store");
		expect(response.body).not.toHaveProperty("asset");
	});

	it("updates unverified metadata at the root member path without file access", async () => {
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
		const body = {
			expectedVersion: 1,
			fileName: "site-notes.txt",
			kind: "document",
		};
		const updated = await request(fixture.app.getHttpServer())
			.patch(`/assets/${asset.id}`)
			.set("x-asset-test-user", fixture.userId)
			.set("Idempotency-Key", randomUUID())
			.send(body)
			.expect(200);
		expect(updated.body.asset).toMatchObject({
			id: asset.id,
			version: 2,
			status: "UNVERIFIED",
			kind: "document",
			fileName: "site-notes.txt",
		});
		expect(updated.body.download).toBeNull();
		expect(updated.body).not.toHaveProperty("transfer");
		const detail = await request(fixture.app.getHttpServer())
			.get(`/assets/${asset.id}`)
			.set("x-asset-test-user", fixture.userId)
			.expect(200);
		expect(detail.body.asset.appointmentId).toBeNull();
		expect(detail.body.download).toBeNull();
		await request(fixture.app.getHttpServer())
			.get(`/projects/${fixture.projectId}/assets/${asset.id}`)
			.set("x-asset-test-user", fixture.userId)
			.expect(404);
	});
});
