import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { get } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { AssetsHttpFixture } from "./assets-http.fixture";

describe("normalized project resource routes", () => {
	const fixture = new AssetsHttpFixture();
	let port: number;
	beforeAll(async () => {
		await fixture.setup();
		await fixture.app.listen(0, "127.0.0.1");
		port = (fixture.app.getHttpServer().address() as AddressInfo).port;
	});
	afterAll(() => fixture.cleanup());

	it("enforces validation and private responses for raw route variants", async () => {
		for (const path of [
			`/Projects/${fixture.projectId}/Assets`,
			`/unused/../projects/${fixture.projectId}/assets`,
			`/unused/%2e%2e/projects/${fixture.projectId}/assets`,
			`/Projects/${fixture.projectId}/Appointments`,
		]) {
			const response = await new Promise<{
				status: number | undefined;
				cache: string | undefined;
				requestId: string | string[] | undefined;
				body: string;
			}>((resolve, reject) => {
				get(
					{
						host: "127.0.0.1",
						port,
						path: `${path}?projectId=other`,
						headers: { "x-asset-test-user": fixture.userId },
					},
					(res) => {
						let body = "";
						res.setEncoding("utf8");
						res.on("data", (chunk: string) => {
							body += chunk;
						});
						res.on("error", reject);
						res.on("end", () =>
							resolve({
								status: res.statusCode,
								cache: res.headers["cache-control"],
								requestId: res.headers["x-request-id"],
								body,
							}),
						);
					},
				).on("error", reject);
			});
			expect(response.status).toBe(400);
			expect(response.cache).toBe("private, no-store");
			expect(response.requestId).toEqual(expect.any(String));
			expect(JSON.parse(response.body)).toMatchObject({
				error: { code: "VALIDATION_ERROR", requestId: response.requestId },
			});
		}
	});

	it("preserves customer project filters with mixed-case route names", async () => {
		await request(fixture.app.getHttpServer())
			.get(
				`/Customers/${fixture.customerId}/Assets?projectId=${fixture.projectId}`,
			)
			.set("x-asset-test-user", fixture.userId)
			.expect(200);
	});
});
