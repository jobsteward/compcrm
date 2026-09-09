export function resolveTestDatabaseUrl(): string | null {
	const explicit = process.env.TEST_DATABASE_URL;
	if (explicit) return explicit;

	const live = process.env.DATABASE_URL;
	if (!live) return null;

	try {
		const parsed = new URL(live);
		const database = parsed.pathname.replace(/^\//, "");
		if (!database) return null;

		parsed.pathname = `/${database.endsWith("_test") ? database : `${database}_test`}`;

		return parsed.toString();
	} catch {
		return null;
	}
}

export function databaseName(value: string): string {
	try {
		return new URL(value).pathname.replace(/^\//, "");
	} catch {
		return value;
	}
}

export function fail(lines: string[]): never {
	console.error(["", ...lines.map((line) => `  ${line}`), ""].join("\n"));
	process.exit(1);
}
