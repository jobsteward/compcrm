import type { AppointmentStatus } from "@crm/db";
import type { z } from "zod";
import { AssetError } from "../assets/asset-error";
import type { AppointmentUpdateInput } from "./appointments.contracts";

export function parseAppointment<T extends z.ZodType>(
	schema: T,
	raw: z.input<T>,
): z.output<T> {
	const parsed = schema.safeParse(raw);
	if (!parsed.success) invalidAppointment("Appointment fields are invalid.");
	return parsed.data;
}

export function invalidAppointment(message: string): never {
	throw new AssetError(400, "VALIDATION_ERROR", message);
}

export function validateAppointmentSchedule(
	startsAt: Date,
	endsAt: Date | null,
	timeZone: string,
	status: AppointmentStatus,
	now: Date,
) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone });
	} catch {
		invalidAppointment("Use an IANA time zone.");
	}
	if (/^[+-]/.test(timeZone)) invalidAppointment("Use an IANA time zone.");
	if (endsAt && endsAt <= startsAt)
		invalidAppointment("The end must follow the start.");
	if (status === "COMPLETED" && startsAt > now)
		invalidAppointment("A completed appointment cannot start in the future.");
}

export function validateAppointmentTransition(
	before: AppointmentStatus | null,
	after: AppointmentStatus,
) {
	if (
		before === after ||
		after === "SCHEDULED" ||
		before === "SCHEDULED" ||
		(!before && after === "COMPLETED")
	)
		return;
	throw new AssetError(
		409,
		"INVALID_APPOINTMENT_STATE",
		"The appointment status transition is invalid.",
	);
}

export function validateAppointmentPatch(input: AppointmentUpdateInput) {
	const fields = Object.keys(input).filter(
		(key) => key !== "expectedVersion" && key !== "archived",
	);
	if (input.archived === false && fields.length)
		invalidAppointment("Restore cannot include appointment edits.");
	if (input.archived === undefined && !fields.length)
		invalidAppointment("Supply an appointment field to update.");
}

export function requireAppointmentVersion(actual: number, expected: number) {
	if (actual !== expected)
		throw new AssetError(
			409,
			"VERSION_CONFLICT",
			"Read the current appointment before updating it.",
		);
}
