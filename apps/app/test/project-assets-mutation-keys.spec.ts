import { describe, expect, test } from "bun:test";
import { createOperationKeyStore } from "../lib/project-assets/mutation-keys";

describe("project mutation keys", () => {
	test("reuses a key for a retry and rotates after discard", () => {
		let sequence = 0;
		const keys = createOperationKeyStore(() => `key-${++sequence}`);

		const first = keys.for("appointment:1:archive:3");
		expect(keys.for("appointment:1:archive:3")).toBe(first);
		expect(keys.for("appointment:1:restore:3")).not.toBe(first);

		keys.clear("appointment:1:archive:3");
		expect(keys.for("appointment:1:archive:3")).not.toBe(first);
	});
});
