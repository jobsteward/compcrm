import { afterAll, describe, expect, it } from "bun:test";

import { closeSchemaWorkers, validateJsonBounded } from "./schema.js";

afterAll(async () => {
	await closeSchemaWorkers();
});

describe("bounded schema validation", () => {
	it("starts source workers with the declared loader", async () => {
		try {
			const errors = await validateJsonBounded(
				{
					type: "object",
					properties: { value: { type: "string" } },
					required: ["value"],
					additionalProperties: false,
				},
				{ value: "ok" },
			);
			expect(errors).toEqual([]);
		} catch (error) {
			console.error("[schema.test] validation rejected:", error);
			throw error;
		}
	});
});
