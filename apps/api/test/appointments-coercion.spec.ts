import { describe, expect, it } from "bun:test";
import {
	timelineCountsInput,
	timelineInput,
} from "../src/activities/activities.contracts";
import {
	appointmentListInput,
	projectAppointmentUpdateInput,
} from "../src/appointments/appointments.contracts";

describe("appointment transport validation", () => {
	it("uses strict archive filters for activity timelines and counts", () => {
		for (const schema of [timelineInput, timelineCountsInput]) {
			expect(schema.parse({}).archived).toBe(false);
			for (const archived of [false, "false"])
				expect(schema.parse({ archived }).archived).toBe(false);
			for (const archived of [true, "true"])
				expect(schema.parse({ archived }).archived).toBe(true);
			for (const archived of ["invalid", "", "0", "1", 0, 1, null])
				expect(schema.safeParse({ archived }).success).toBe(false);
		}
	});
	it("accepts explicit archive booleans and rejects other query values", () => {
		for (const archived of [false, "false"]) {
			expect(appointmentListInput.parse({ archived }).archived).toBe(false);
		}
		for (const archived of [true, "true"]) {
			expect(appointmentListInput.parse({ archived }).archived).toBe(true);
		}
		for (const archived of ["invalid", "", "0", "1", 0, 1, null]) {
			expect(appointmentListInput.safeParse({ archived }).success).toBe(false);
		}
		expect(appointmentListInput.parse({}).archived).toBe(false);
	});

	it("requires numeric positive integer versions", () => {
		const input = {
			projectId: "project",
			appointmentId: "appointment",
			title: "Changed",
		};
		for (const expectedVersion of ["1", "", 0, -1, 1.5, null, true]) {
			expect(
				projectAppointmentUpdateInput.safeParse({ ...input, expectedVersion })
					.success,
			).toBe(false);
		}
		expect(
			projectAppointmentUpdateInput.parse({ ...input, expectedVersion: 1 })
				.expectedVersion,
		).toBe(1);
	});
});
