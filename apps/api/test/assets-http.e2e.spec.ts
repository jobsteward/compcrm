import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AssetsHttpFixture } from "./assets-http.fixture";

let fixture: AssetsHttpFixture;
let app: AssetsHttpFixture["app"];
let userId: AssetsHttpFixture["userId"];
let otherProjectId: AssetsHttpFixture["otherProjectId"];
let customerId: AssetsHttpFixture["customerId"];
let base: AssetsHttpFixture["base"];
let metadata: AssetsHttpFixture["metadata"];

describe("Asset HTTP authentication and validation", () => {
	beforeAll(async () => {
		fixture = new AssetsHttpFixture();
		await fixture.setup();
		app = fixture.app;
		userId = fixture.userId;
		otherProjectId = fixture.otherProjectId;
		customerId = fixture.customerId;
		base = fixture.base;
		metadata = fixture.metadata;
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("protects all ten endpoints and returns the versioned error envelope", async () => {
		const endpoints = [
			["post", `${base}/asset-uploads`],
			["get", `${base}/asset-uploads/upload`],
			["post", `${base}/asset-uploads/upload/url`],
			["post", `${base}/asset-uploads/upload/confirm`],
			["delete", `${base}/asset-uploads/upload`],
			["get", `/rest/v1/customers/${customerId}/assets`],
			["get", `${base}/assets`],
			["get", `${base}/assets/asset`],
			["get", `${base}/assets/asset/download`],
			["delete", `${base}/assets/asset`],
		] as const;
		for (const [method, path] of endpoints) {
			const call = request(app.getHttpServer())
				[method](path)
				.set("X-Request-Id", "asset-request-test");
			if (method === "post")
				call.send(path.endsWith("asset-uploads") ? metadata : {});
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
		const deniedWrite = await request(app.getHttpServer())
			.post(`${base}/asset-uploads`)
			.set("x-asset-test-user", userId)
			.set("x-asset-test-scope", "crm.read")
			.set("Idempotency-Key", randomUUID())
			.send(metadata)
			.expect(403);
		expect(deniedWrite.body.error.code).toBe("FORBIDDEN");
		expect(deniedWrite.headers["www-authenticate"]).toContain("crm.write");
		const deniedRead = await request(app.getHttpServer())
			.get(`${base}/assets`)
			.set("x-asset-test-user", userId)
			.set("x-asset-test-scope", "crm.write")
			.expect(403);
		expect(deniedRead.body.error.code).toBe("FORBIDDEN");
	});

	it("rejects unknown metadata, numeric strings, path shadowing, and missing keys", async () => {
		for (const body of [
			{ ...metadata, extra: true },
			{ ...metadata, sizeBytes: "0" },
			{ ...metadata, projectId: otherProjectId },
			{ ...metadata, fileName: "../file" },
		]) {
			const response = await request(app.getHttpServer())
				.post(`${base}/asset-uploads`)
				.set("x-asset-test-user", userId)
				.set("Idempotency-Key", randomUUID())
				.send(body)
				.expect(400);
			expect(response.body.error.code).toBe("VALIDATION_ERROR");
		}
		await request(app.getHttpServer())
			.post(`${base}/asset-uploads`)
			.set("x-asset-test-user", userId)
			.send(metadata)
			.expect(400);
		for (const query of [
			"unknown=1",
			`projectId=${otherProjectId}`,
			"page=1.5",
		]) {
			const response = await request(app.getHttpServer())
				.get(`${base}/assets?${query}`)
				.set("x-asset-test-user", userId)
				.expect(400);
			expect(response.body.error.code).toBe("VALIDATION_ERROR");
		}
		await request(app.getHttpServer())
			.post(`${base}/asset-uploads?extra=1`)
			.set("x-asset-test-user", userId)
			.set("Idempotency-Key", randomUUID())
			.send(metadata)
			.expect(400);
		await request(app.getHttpServer())
			.post(`${base}/asset-uploads`)
			.set("x-asset-test-user", userId)
			.set("Content-Type", "application/json")
			.send("{")
			.expect(400);
	});
});
