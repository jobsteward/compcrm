const DATE_PARTS = ["year", "month", "day", "hour", "minute"] as const;

function partsFor(date: Date, timeZone: string) {
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		calendar: "gregory",
		numberingSystem: "latn",
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	})
		.formatToParts(date)
		.reduce<Record<string, string>>((parts, part) => {
			if (DATE_PARTS.includes(part.type as (typeof DATE_PARTS)[number])) {
				parts[part.type] = part.value;
			}
			return parts;
		}, {});
}

export function isoToLocalInput(
	value: string | null,
	timeZone: string,
): string {
	if (!value) return "";
	try {
		const parts = partsFor(new Date(value), timeZone);
		return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
	} catch {
		return value.slice(0, 16);
	}
}

function zoneOffsetMs(date: Date, timeZone: string): number {
	const parts = partsFor(date, timeZone);
	const asUtc = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour),
		Number(parts.minute),
		date.getUTCSeconds(),
	);
	return asUtc - date.getTime();
}

function wallKey(parts: Record<string, string>) {
	return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function localInputToIso(value: string, timeZone: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
	if (!match) throw new Error("Enter a valid date and time.");
	const [, yearText, monthText, dayText, hourText, minuteText] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const hour = Number(hourText);
	const minute = Number(minuteText);
	const localAsUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
	if (localAsUtc.toISOString().slice(0, 16) !== value)
		throw new Error("Enter a valid date and time.");
	const offsets = new Set<number>();
	for (const hours of [-48, -24, -2, -1, 0, 1, 2, 24, 48]) {
		offsets.add(
			zoneOffsetMs(
				new Date(localAsUtc.getTime() + hours * 3_600_000),
				timeZone,
			),
		);
	}
	const matches = [...offsets]
		.map((offset) => new Date(localAsUtc.getTime() - offset))
		.filter((candidate) => wallKey(partsFor(candidate, timeZone)) === value);
	if (matches.length === 0)
		throw new Error(
			"This local time does not exist in the selected time zone.",
		);
	if (matches.length > 1)
		throw new Error(
			"This local time occurs twice in the selected time zone. Choose another time.",
		);
	return matches[0]?.toISOString() ?? "";
}

export function dateBoundary(value: string, end = false): string | undefined {
	if (!value) return undefined;
	const boundary = new Date(`${value}T00:00:00.000Z`);
	if (end) boundary.setUTCDate(boundary.getUTCDate() + 1);
	return boundary.toISOString();
}

export function defaultTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function formatAppointmentDate(
	value: string,
	timeZone: string,
	options: Intl.DateTimeFormatOptions = {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	},
) {
	try {
		return new Intl.DateTimeFormat(undefined, {
			timeZone,
			...options,
		}).format(new Date(value));
	} catch {
		return new Date(value).toLocaleString();
	}
}

export function formatBytes(value: number | null): string {
	if (value === null) return "Unknown size";
	if (value < 1024) return `${value} B`;
	const units = ["KB", "MB", "GB"];
	let size = value / 1024;
	let unit = 0;
	while (size >= 1024 && unit < units.length - 1) {
		size /= 1024;
		unit += 1;
	}
	return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}
