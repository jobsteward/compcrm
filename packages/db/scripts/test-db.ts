import "@crm/env/load";

import { spawnSync } from "node:child_process";

import { createTestDatabase } from "./test-db-create";
import { databaseName, fail, resolveTestDatabaseUrl } from "./test-db-url";

const url = resolveTestDatabaseUrl();

if (!url) {
	fail([
		"Neither TEST_DATABASE_URL nor DATABASE_URL is set.",
		"Copy .env.example to .env at the repo root.",
	]);
}

const name = databaseName(url);

if (!name.endsWith("_test")) {
	fail([
		`TEST_DATABASE_URL names "${name}", which does not end in _test.`,
		"The suite refuses anything else, because it deletes rows it expects to",
		"put back and an interrupted run leaves them deleted.",
	]);
}

await createTestDatabase(url, name, process.argv.includes("--reset"));
migrate(url);

if (!process.env.TEST_DATABASE_URL) {
	console.log(
		[
			"",
			"  Add this to .env so the suite finds it:",
			"",
			`    TEST_DATABASE_URL="${url}"`,
			"",
		].join("\n"),
	);
}

function migrate(target: string): void {
	const result = spawnSync("prisma", ["migrate", "deploy"], {
		stdio: "inherit",
		env: { ...process.env, DATABASE_URL: target },
	});

	if (result.error) {
		fail([
			"Could not run prisma migrate deploy.",
			"Run this through the package script, which puts prisma on PATH:",
			"",
			"    bun run db:test",
			"",
			result.error.message,
		]);
	}

	if (result.status !== 0) process.exit(result.status ?? 1);
}
