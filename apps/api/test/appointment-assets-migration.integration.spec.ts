import { beforeAll, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { assertLocalTestDatabase, rawDb } from "./appointment-assets.fixture";

beforeAll(assertLocalTestDatabase);

it("backfills legacy artifact timestamps before enforcing the updatedAt column", async () => {
	const migration = await Bun.file(
		new URL(
			"../../../packages/db/prisma/migrations/20260910160000_managed_appointments/migration.sql",
			import.meta.url,
		),
	).text();
	const schema = `appointment_migration_${randomUUID().replaceAll("-", "")}`;
	const statements = [
		...Array.from(
			migration.matchAll(
				/ALTER TABLE "artifact" ADD COLUMN "(?:version|updatedAt)"[^;]+;/g,
			),
			(match) => match[0],
		),
		migration.match(/DO \$\$[\s\S]*?END \$\$;/)?.[0],
		migration.match(
			/ALTER TABLE "artifact" ALTER COLUMN "updatedAt" SET NOT NULL;/,
		)?.[0],
		migration.match(
			/ALTER TABLE "artifact" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;/,
		)?.[0],
	];
	if (statements.some((statement) => !statement))
		throw new Error(
			"The artifact migration backfill statements are incomplete.",
		);

	await rawDb.$transaction(async (tx) => {
		await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
		await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
		await tx.$executeRawUnsafe(
			`CREATE TABLE "organization" ("id" TEXT PRIMARY KEY)`,
		);
		await tx.$executeRawUnsafe(
			`CREATE TABLE "artifact" ("id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "dealId" TEXT NOT NULL, "type" TEXT NOT NULL, "fileName" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL)`,
		);
		await tx.$executeRawUnsafe(
			`INSERT INTO "organization" ("id") VALUES ('tenant-a'), ('tenant-b')`,
		);
		await tx.$executeRawUnsafe(
			`INSERT INTO "artifact" ("id", "organizationId", "dealId", "type", "fileName", "storageKey", "createdAt") VALUES ('old-a', 'tenant-a', 'deal-a', 'photo', 'a.jpg', 'a/key', '2025-01-02 03:04:05.006'), ('old-b', 'tenant-b', 'deal-b', 'document', 'b.pdf', 'b/key', '2025-02-03 04:05:06.007')`,
		);
		for (const statement of statements) {
			if (!statement) throw new Error("Missing artifact migration statement");
			await tx.$executeRawUnsafe(statement);
		}
		const rows = await tx.$queryRawUnsafe<
			Array<{ id: string; created: string; updated: string; version: number }>
		>(
			`SELECT "id", to_char("createdAt", 'YYYY-MM-DD HH24:MI:SS.MS') AS created, to_char("updatedAt", 'YYYY-MM-DD HH24:MI:SS.MS') AS updated, "version" FROM "artifact" ORDER BY "id"`,
		);
		expect(rows).toEqual([
			{
				id: "old-a",
				created: "2025-01-02 03:04:05.006",
				updated: "2025-01-02 03:04:05.006",
				version: 1,
			},
			{
				id: "old-b",
				created: "2025-02-03 04:05:06.007",
				updated: "2025-02-03 04:05:06.007",
				version: 1,
			},
		]);
		const columns = await tx.$queryRawUnsafe<Array<{ isNullable: string }>>(
			`SELECT "is_nullable" AS "isNullable" FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'artifact' AND column_name = 'updatedAt'`,
		);
		expect(columns[0]?.isNullable).toBe("NO");
		await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
	});
});
