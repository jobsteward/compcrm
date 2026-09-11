import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import request from "supertest";
import type { OpenAPIObject } from "trpc-to-openapi";
import { AssetsHttpFixture } from "./assets-http.fixture";

const assetMethods = ["get", "post", "patch", "delete"] as const;
const openapiMethods = [
	"get",
	"post",
	"put",
	"patch",
	"delete",
	"options",
	"head",
	"trace",
] as const;

describe("Asset HTTP route contract", () => {
	const fixture = new AssetsHttpFixture();

	beforeAll(() => fixture.setup());
	afterAll(() => fixture.cleanup());

	it("publishes exactly seven canonical asset operations", async () => {
		const document = await request(fixture.app.getHttpServer())
			.get("/openapi.json")
			.expect(200);
		const openapi = document.body as OpenAPIObject;
		const paths = openapi.paths ?? {};
		const expected = {
			"/projects/{projectId}/assets": ["get", "post"],
			"/appointments/{appointmentId}/assets": ["get", "post"],
			"/assets/{assetId}": ["get", "patch", "delete"],
		} as const;
		for (const path of Object.keys(expected) as Array<keyof typeof expected>) {
			const methods = expected[path];
			const pathItem = paths[path];
			expect(pathItem).toBeDefined();
			if (!pathItem) continue;
			const actual = assetMethods.filter(
				(method) => pathItem[method] !== undefined,
			);
			expect(actual).toEqual([...methods]);
			for (const method of methods) {
				const operation = pathItem[method];
				expect(operation).toBeDefined();
				if (method !== "get" && operation)
					expect(operation.parameters).toContainEqual(
						expect.objectContaining({
							name: "Idempotency-Key",
							in: "header",
							required: true,
						}),
					);
			}
		}
		const expectedOperations = Object.entries(expected)
			.flatMap(([path, methods]) =>
				methods.map((method) => `${method} ${path}`),
			)
			.sort();
		const taggedAssetOperations = Object.entries(paths)
			.flatMap(([path, pathItem]) =>
				openapiMethods.flatMap((method) =>
					pathItem[method]?.tags?.includes("Assets")
						? [`${method} ${path}`]
						: [],
				),
			)
			.sort();
		expect(taggedAssetOperations).toEqual(expectedOperations);
		expect(taggedAssetOperations).toHaveLength(7);
	});

	it("does not publish workflow, customer, nested member, or compatibility paths", async () => {
		const document = await request(fixture.app.getHttpServer())
			.get("/openapi.json")
			.expect(200);
		const openapi = document.body as OpenAPIObject;
		const paths = Object.keys(openapi.paths ?? {});
		expect(paths).not.toContain("/projects/{projectId}/asset-uploads");
		expect(paths).not.toContain("/customers/{customerId}/assets");
		expect(paths).not.toContain("/projects/{projectId}/assets/{assetId}");
		expect(paths.some((path) => path.startsWith("/rest"))).toBe(false);
		expect(paths.some((path) => path.startsWith("/v1"))).toBe(false);

		for (const path of [
			`${fixture.base}/asset-uploads`,
			`/customers/${fixture.customerId}/assets`,
			`${fixture.base}/assets/missing`,
			`/rest/v1${fixture.base}/assets`,
		]) {
			await request(fixture.app.getHttpServer()).get(path).expect(404);
		}
	});

	it("returns private no-store 404 responses without exposing asset metadata", async () => {
		const response = await request(fixture.app.getHttpServer())
			.get("/assets/missing")
			.set("x-asset-test-user", fixture.userId)
			.set("X-Request-Id", "asset-private-test")
			.expect(404);
		expect(response.body).toEqual({
			error: {
				code: "RESOURCE_NOT_FOUND",
				message: "The record does not exist or is inaccessible.",
				requestId: "asset-private-test",
				retryable: false,
			},
		});
		expect(response.headers["cache-control"]).toBe("private, no-store");
		expect(response.headers["x-request-id"]).toBe("asset-private-test");
		expect(response.body).not.toHaveProperty("asset");
	});
});
