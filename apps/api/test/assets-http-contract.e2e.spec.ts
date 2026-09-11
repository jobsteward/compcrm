import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AssetsHttpFixture } from "./assets-http.fixture";

let fixture: AssetsHttpFixture;
let app: AssetsHttpFixture["app"];
let userId: AssetsHttpFixture["userId"];
let base: AssetsHttpFixture["base"];
let metadata: AssetsHttpFixture["metadata"];

describe("Asset HTTP contract compatibility", () => {
	beforeAll(async () => {
		fixture = new AssetsHttpFixture();
		await fixture.setup();
		app = fixture.app;
		userId = fixture.userId;
		base = fixture.base;
		metadata = fixture.metadata;
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("cancels an upload and preserves its durable status", async () => {
		const created = await request(app.getHttpServer())
			.post(`${base}/asset-uploads`)
			.set("x-asset-test-user", userId)
			.set("Idempotency-Key", randomUUID())
			.send(metadata)
			.expect(200);
		const uploadId = created.body.upload.id;
		const canceled = await request(app.getHttpServer())
			.delete(`${base}/asset-uploads/${uploadId}`)
			.set("x-asset-test-user", userId)
			.set("Idempotency-Key", randomUUID())
			.expect(200);
		expect(canceled.body).toEqual({ uploadId, status: "CANCELED" });
		const confirmation = await request(app.getHttpServer())
			.post(`${base}/asset-uploads/${uploadId}/confirm`)
			.set("x-asset-test-user", userId)
			.set("Idempotency-Key", randomUUID())
			.send({})
			.expect(409);
		expect(confirmation.body.error.details.state).toBe("CANCELED");
	});

	it("publishes root assets and preserves CRM error formatting", async () => {
		const document = await request(app.getHttpServer())
			.get("/openapi.json")
			.expect(200);
		const operations = Object.entries(document.body.paths)
			.filter(([path]) =>
				/^\/(projects|customers)\/.*\/(assets|asset-uploads)/.test(path),
			)
			.flatMap(([, methods]) =>
				Object.keys(
					methods as { get?: object; post?: object; delete?: object },
				).filter((method) =>
					["get", "post", "patch", "delete"].includes(method),
				),
			);
		expect(operations).toHaveLength(11);
		const createOperation =
			document.body.paths["/projects/{projectId}/asset-uploads"].post;
		expect(
			Object.keys(document.body.paths).some((path) => path.startsWith("/rest")),
		).toBe(false);
		expect(createOperation.parameters).toContainEqual(
			expect.objectContaining({
				name: "Idempotency-Key",
				in: "header",
				required: true,
			}),
		);
		expect(
			createOperation.responses["413"].content["application/json"].schema
				.properties.error.required,
		).toContain("requestId");
		const legacy = await request(app.getHttpServer())
			.get("/companies/missing")
			.expect(401);
		expect(legacy.body.code).toBe("UNAUTHORIZED");
		expect(legacy.body).not.toHaveProperty("error");
		await request(app.getHttpServer())
			.get("/internal/assets/process")
			.expect(process.env.CRON_SECRET ? 403 : 503);
	});
});
