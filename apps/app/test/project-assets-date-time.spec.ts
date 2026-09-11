import { describe, expect, test } from "bun:test";
import {
	dateBoundary,
	isoToLocalInput,
	localInputToIso,
} from "../lib/project-assets/date-time";

describe("project appointment date and time", () => {
	test("formats and converts a zoned appointment", () => {
		expect(isoToLocalInput("2026-01-15T15:00:00.000Z", "America/Chicago")).toBe(
			"2026-01-15T09:00",
		);
		expect(localInputToIso("2026-01-15T09:00", "America/Chicago")).toBe(
			"2026-01-15T15:00:00.000Z",
		);
	});

	test("rejects nonexistent and ambiguous daylight-saving times", () => {
		expect(() =>
			localInputToIso("2026-03-08T02:30", "America/Chicago"),
		).toThrow("does not exist");
		expect(() =>
			localInputToIso("2026-11-01T01:30", "America/Chicago"),
		).toThrow("occurs twice");
	});

	test("uses an exclusive upper date boundary", () => {
		expect(dateBoundary("2026-09-15")).toBe("2026-09-15T00:00:00.000Z");
		expect(dateBoundary("2026-09-15", true)).toBe("2026-09-16T00:00:00.000Z");
	});
});
