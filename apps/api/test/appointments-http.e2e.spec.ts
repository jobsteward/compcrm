import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AssetsHttpFixture } from "./assets-http.fixture";

describe("managed appointment REST contract", () => {
	const fixture = new AssetsHttpFixture();
	const base = `/projects/${fixture.projectId}/appointments`;
	const body = {
		title: "Site visit",
		startsAt: "2026-01-01T10:00:00Z",
		timeZone: "America/Chicago",
	};
	beforeAll(() => fixture.setup());
	afterAll(() => fixture.cleanup());
	const call = (
		method: "get" | "post" | "patch" | "delete",
		path = base,
		key = randomUUID(),
	) =>
		request(fixture.app.getHttpServer())
			[method](path)
			.set("x-asset-test-user", fixture.userId)
			.set("Idempotency-Key", key);

	it("creates, edits, archives, restores, and replays through public paths", async () => {
		const key = randomUUID();
		const first = await call("post", base, key).send(body).expect(200);
		expect((await call("post", base, key).send(body).expect(200)).body).toEqual(
			first.body,
		);
		expect(first.headers["cache-control"]).toBe("private, no-store");
		expect(first.headers["x-request-id"]).toBeString();
		const id = first.body.appointment.id;
		const path = `${base}/${id}`;
		const detail = await call("get", path).expect(200);
		expect(detail.body.appointment).toMatchObject({
			id,
			version: 1,
			status: "SCHEDULED",
			archivedAt: null,
		});
		const edited = await call("patch", path)
			.send({ expectedVersion: 1, status: "COMPLETED", notes: "Measured wall" })
			.expect(200);
		expect(edited.body.appointment).toMatchObject({
			version: 2,
			status: "COMPLETED",
			notes: "Measured wall",
		});
		const archived = await call("delete", path).expect(200);
		expect(archived.body).toEqual({
			appointmentId: id,
			archivedAt: expect.any(String),
			version: 3,
		});
		expect((await call("delete", path).expect(200)).body).toEqual(
			archived.body,
		);
		const active = await call(
			"get",
			`${base}?page=1&pageSize=1&archived=false`,
		).expect(200);
		expect(active.body.total).toBe(0);
		const archive = await call(
			"get",
			`${base}?archived=true&status=COMPLETED&from=2026-01-01T00%3A00%3A00Z&to=2026-01-02T00%3A00%3A00Z`,
		).expect(200);
		expect(archive.body.items.map((item: { id: string }) => item.id)).toEqual([
			id,
		]);
		const restoreKey = randomUUID();
		const restored = await call("patch", path, restoreKey)
			.send({ expectedVersion: 3, archived: false })
			.expect(200);
		expect(restored.body.appointment).toMatchObject({
			version: 4,
			status: "COMPLETED",
			archivedAt: null,
		});
		expect(
			(
				await call("patch", path, restoreKey)
					.send({ expectedVersion: 3, archived: false })
					.expect(200)
			).body,
		).toEqual(restored.body);
	});

	it("rejects unsafe body fields, query controls, and malformed versions", async () => {
		for (const invalid of [
			{ ...body, projectId: "other" },
			{ ...body, appointmentId: "other" },
			{ ...body, unexpected: true },
		]) {
			const response = await call("post").send(invalid).expect(400);
			expect(response.body.error.code).toBe("VALIDATION_ERROR");
		}
		const created = await call("post").send(body).expect(200);
		const path = `${base}/${created.body.appointment.id}`;
		for (const invalid of [
			{ expectedVersion: "1", title: "Changed" },
			{ expectedVersion: 1, archived: true },
			{ expectedVersion: 1, archived: false, title: "Changed" },
			{ expectedVersion: 1, projectId: "other", title: "Changed" },
			{ expectedVersion: 1 },
		]) {
			const response = await call("patch", path).send(invalid).expect(400);
			expect(response.body.error.code).toBe("VALIDATION_ERROR");
		}
		for (const query of [
			"archived=invalid",
			"projectId=other",
			"appointmentId=other",
			"page=1.5",
			"extra=1",
		])
			await call("get", `${base}?${query}`).expect(400);
		await call("delete", `${path}?expectedVersion=1`).expect(400);
		await call("delete", path).send({ expectedVersion: 1 }).expect(400);
		await call("get", path).send({}).expect(400);
		await call(
			"get",
			`/projects/${fixture.otherProjectId}/appointments/${created.body.appointment.id}`,
		).expect(404);
	});

	it("enforces authentication, scopes, and documents each route once", async () => {
		const denied = await request(fixture.app.getHttpServer())
			.get(base)
			.expect(401);
		expect(denied.body.error.code).toBe("AUTH_REQUIRED");
		await call("post")
			.set("x-asset-test-scope", "crm.read")
			.send(body)
			.expect(403);
		await call("get").set("x-asset-test-scope", "crm.write").expect(403);
		const document = await request(fixture.app.getHttpServer())
			.get("/openapi.json")
			.expect(200);
		const paths = document.body.paths;
		expect(paths["/projects/{projectId}/appointments"].post).toBeDefined();
		expect(
			paths["/projects/{projectId}/appointments/{appointmentId}"].patch,
		).toBeDefined();
		expect(paths).not.toHaveProperty("/rest/projects/{projectId}/appointments");
		const operationIds = Object.values(paths).flatMap((methods) =>
			Object.entries(methods as object)
				.filter(([method]) =>
					["get", "post", "put", "patch", "delete"].includes(method),
				)
				.map(([, operation]) => operation.operationId),
		);
		expect(new Set(operationIds).size).toBe(operationIds.length);
	});
});
