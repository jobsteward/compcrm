import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import pg from "pg";

import { fail } from "./test-db-url";

const SCHEMA = join(dirname(import.meta.dirname), "prisma", "schema.prisma");
const MIGRATIONS = join(dirname(import.meta.dirname), "prisma", "migrations");

export async function createTestDatabase(
	target: string,
	database: string,
	forced: boolean,
): Promise<void> {
	const maintenance = new URL(target);
	maintenance.pathname = "/postgres";
	maintenance.search = "";

	const client = new pg.Client({ connectionString: maintenance.toString() });

	try {
		await client.connect();
	} catch (error) {
		fail([
			`Could not reach the server at ${new URL(target).host}.`,
			"Is Postgres running?  docker compose up -d",
			"",
			error instanceof Error ? error.message : String(error),
		]);
	}

	try {
		const existing = await client.query(
			"SELECT 1 FROM pg_database WHERE datname = $1",
			[database],
		);

		if (existing.rowCount) {
			const reason = forced
				? "you asked for --reset"
				: await stale(target, database);

			if (!reason) {
				console.log(`  ${database} already exists`);
				return;
			}

			console.log(`  rebuilding ${database}: ${reason}`);
			await drop(client, database);
		}

		await client.query(`CREATE DATABASE "${database}"`);
		console.log(`  created ${database}`);
	} finally {
		await client.end();
	}
}

async function drop(client: pg.Client, database: string): Promise<void> {
	await client.query(
		`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
		 WHERE datname = $1 AND pid <> pg_backend_pid()`,
		[database],
	);
	await client.query(`DROP DATABASE IF EXISTS "${database}"`);
}

async function stale(target: string, database: string): Promise<string | null> {
	const applied = await appliedMigrations(target);

	if (applied === null) return null;

	const onDisk = new Set(
		existsSync(MIGRATIONS)
			? readdirSync(MIGRATIONS, { withFileTypes: true })
					.filter((entry) => entry.isDirectory())
					.map((entry) => entry.name)
			: [],
	);

	const foreign = applied.filter((migration) => !onDisk.has(migration));

	if (foreign.length > 0) {
		return `${database} holds ${foreign.length} migration(s) this branch does not have, starting with ${foreign[0]}`;
	}

	return drifted(target) ? `${database} no longer matches schema.prisma` : null;
}

async function appliedMigrations(target: string): Promise<string[] | null> {
	const client = new pg.Client({ connectionString: target });

	try {
		await client.connect();
	} catch {
		return null;
	}

	try {
		const rows = await client.query<{ migration_name: string }>(
			`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
		);
		return rows.rows.map((row) => row.migration_name);
	} catch {
		return null;
	} finally {
		await client.end();
	}
}

function drifted(target: string): boolean {
	const result = spawnSync(
		"prisma",
		[
			"migrate",
			"diff",
			"--from-config-datasource",
			"--to-schema",
			SCHEMA,
			"--exit-code",
		],
		{ stdio: "ignore", env: { ...process.env, DATABASE_URL: target } },
	);

	return result.status === 2;
}
