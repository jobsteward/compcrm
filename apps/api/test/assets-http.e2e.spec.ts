import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AssetsHttpFixture } from "./assets-http.fixture";

let fixture: AssetsHttpFixture;

describe("Asset HTTP authentication and validation", () => {
	beforeAll(async () => {
		fixture = new AssetsHttpFixture();
		await fixture.setup();
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("protects the exact seven asset endpoints with the error envelope", async () => {
		const endpoints = [
			["post", `${fixture.base}/assets`, fixture.metadata],
			["get", `${fixture.base}/assets`, undefined],
			["post", "/appointments/missing/assets", fixture.metadata],
			["get", "/appointments/missing/assets", undefined],
			["get", "/assets/missing", undefined],
			["patch", "/assets/missing", { uploadCompleted: true }],
			["delete", "/assets/missing", undefined],
		] as const;
		for (const [method, path, body] of endpoints) {
			const call = request(fixture.app.getHttpServer())
				[method](path)
				.set("X-Request-Id", "asset-request-test");
			if (body) call.send(body);
			const response = await call.expect(401);
			expect(response.body).toEqual({
				error: {
					code: "AUTH_REQUIRED",
					message: "Authentication is required.",
					requestId: "asset-request-test",
					retryable: false,
				},
			});
			expect(response.headers["cache-control"]).toBe("private, no-store");
			expect(response.headers["x-request-id"]).toBe("asset-request-test");
		}
	});

	it("enforces read and write OAuth scopes", async () => {
		for (const [method, path, body] of [
			["post", `${fixture.base}/assets`, fixture.metadata],
			["patch", "/assets/missing", { uploadCompleted: true }],
			["delete", "/assets/missing", undefined],
		] as const) {
			const call = request(fixture.app.getHttpServer())
				[method](path)
				.set("x-asset-test-user", fixture.userId)
				.set("x-asset-test-scope", "crm.read")
				.set("Idempotency-Key", randomUUID());
			if (body) call.send(body);
			const response = await call.expect(403);
			expect(response.body.error.code).toBe("FORBIDDEN");
			expect(response.headers["www-authenticate"]).toContain("crm.write");
		}

		for (const path of [
			`${fixture.base}/assets`,
			"/appointments/missing/assets",
			"/assets/missing",
		]) {
			const response = await request(fixture.app.getHttpServer())
				.get(path)
				.set("x-asset-test-user", fixture.userId)
				.set("x-asset-test-scope", "crm.write")
				.expect(403);
			expect(response.body.error.code).toBe("FORBIDDEN");
		}
	});

	it("rejects shadowed identifiers, unknown fields, and invalid JSON numbers", async () => {
		for (const [path, body] of [
			[
				`${fixture.base}/assets`,
				{ ...fixture.metadata, projectId: fixture.otherProjectId },
			],
			[
				"/appointments/missing/assets",
				{ ...fixture.metadata, appointmentId: "shadowed" },
			],
			[`${fixture.base}/assets`, { ...fixture.metadata, extra: true }],
			[`${fixture.base}/assets`, { ...fixture.metadata, sizeBytes: "4" }],
			[`${fixture.base}/assets`, { ...fixture.metadata, fileName: "../file" }],
		] as const) {
			const response = await request(fixture.app.getHttpServer())
				.post(path)
				.set("x-asset-test-user", fixture.userId)
				.set("Idempotency-Key", randomUUID())
				.send(body)
				.expect(400);
			expect(response.body.error.code).toBe("VALIDATION_ERROR");
		}
	});

	it("rejects path identifiers in queries and requires mutation keys", async () => {
		for (const query of [
			"unknown=1",
			`projectId=${fixture.otherProjectId}`,
			"appointmentId=other",
			"assetId=other",
		]) {
			const response = await request(fixture.app.getHttpServer())
				.get(`${fixture.base}/assets?${query}`)
				.set("x-asset-test-user", fixture.userId)
				.expect(400);
			expect(response.body.error.code).toBe("VALIDATION_ERROR");
		}
		const missingKey = await request(fixture.app.getHttpServer())
			.post(`${fixture.base}/assets`)
			.set("x-asset-test-user", fixture.userId)
			.send(fixture.metadata)
			.expect(400);
		expect(missingKey.body.error.code).toBe("VALIDATION_ERROR");
		const invalidJson = await request(fixture.app.getHttpServer())
			.post(`${fixture.base}/assets`)
			.set("x-asset-test-user", fixture.userId)
			.set("Idempotency-Key", randomUUID())
			.set("Content-Type", "application/json")
			.send("{")
			.expect(400);
		expect(invalidJson.body.error.code).toBe("VALIDATION_ERROR");
	});
});
