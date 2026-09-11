import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
} from "bun:test";
import {
	AppointmentAssetsFixture,
	assertLocalTestDatabase,
	assetTest as it,
	rawDb,
	scopedDb,
} from "./appointment-assets.fixture";
import { ASSET_TEST_ORGANIZATION_ID } from "./assets-tenant.fixture";

let fixture: AppointmentAssetsFixture;

async function lockedProject(projectId: string, organizationId: string) {
	const sql = new Bun.SQL(process.env.TEST_DATABASE_URL ?? "");
	let releaseLock!: () => void;
	const released = new Promise<void>((resolve) => {
		releaseLock = resolve;
	});
	let acquired!: () => void;
	const lockAcquired = new Promise<void>((resolve) => {
		acquired = resolve;
	});
	const transaction = sql.begin(async (tx) => {
		await tx`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
		await tx`SELECT "id" FROM "deal" WHERE "id" = ${projectId} FOR UPDATE`;
		acquired();
		await released;
	});
	await lockAcquired;
	let open = true;
	return {
		async waitFor(waiters: number) {
			for (let attempt = 0; attempt < 200; attempt++) {
				const result = await sql<{ count: number }[]>`
					SELECT count(*)::int AS count
					FROM pg_stat_activity
					WHERE pid <> pg_backend_pid()
					AND wait_event_type = 'Lock'
					AND query ILIKE '%deal%FOR UPDATE%'
				`;
				if ((result[0]?.count ?? 0) >= waiters) return;
				await new Promise<void>((resolve) => setImmediate(resolve));
			}
			throw new Error(`Expected ${waiters} project lock waiters.`);
		},
		async release() {
			if (!open) return;
			open = false;
			releaseLock();
			await transaction;
			await sql.end();
		},
	};
}

async function race(order: "archive" | "relink") {
	const target = await fixture.appointment({ title: "Target appointment" });
	const source = await fixture.appointment({ title: "Source appointment" });
	const { assetId } = await fixture.ready({
		activityId: source.appointment.id,
	});
	const gate = await lockedProject(
		fixture.assets.projectId,
		ASSET_TEST_ORGANIZATION_ID,
	);
	const operations: Promise<unknown>[] = [];
	let released = false;
	const archive = () => fixture.archive(target.appointment.id, fixture.actor);
	const relink = () =>
		fixture.updateAsset(
			assetId,
			{ expectedVersion: 1, activityId: target.appointment.id },
			fixture.otherActor,
		);
	try {
		operations.push(order === "archive" ? archive() : relink());
		await gate.waitFor(1);
		operations.push(order === "archive" ? relink() : archive());
		await gate.waitFor(2);
		await gate.release();
		released = true;
		return await Promise.allSettled(operations);
	} finally {
		if (!released) await gate.release();
		await Promise.allSettled(operations);
	}
}

async function uploadRace(order: "archive" | "upload") {
	const target = await fixture.appointment({ title: "Upload target" });
	const gate = await lockedProject(
		fixture.assets.projectId,
		ASSET_TEST_ORGANIZATION_ID,
	);
	const operations: Promise<unknown>[] = [];
	let released = false;
	const archive = () => fixture.archive(target.appointment.id, fixture.actor);
	const upload = () =>
		fixture.createUpload(
			{ activityId: target.appointment.id },
			fixture.otherActor,
		);
	try {
		operations.push(order === "archive" ? archive() : upload());
		await gate.waitFor(1);
		operations.push(order === "archive" ? upload() : archive());
		await gate.waitFor(2);
		await gate.release();
		released = true;
		return { target, results: await Promise.allSettled(operations) };
	} finally {
		if (!released) await gate.release();
		await Promise.allSettled(operations);
	}
}

describe("appointment and asset project lock ordering", () => {
	beforeAll(assertLocalTestDatabase);
	beforeEach(async () => {
		fixture = new AppointmentAssetsFixture();
		await fixture.setup();
	});
	afterEach(async () => fixture.cleanup());
	afterAll(async () => rawDb.$disconnect());

	it("serializes archive before a different actor's asset relink", async () => {
		const results = await race("archive");
		expect(results[0]?.status).toBe("fulfilled");
		expect(results[1]?.status).toBe("rejected");
		if (results[1]?.status === "rejected")
			expect(results[1].reason).toMatchObject({ code: "APPOINTMENT_ARCHIVED" });
	});

	it("serializes asset relink before archive and preserves the accepted reference", async () => {
		const results = await race("relink");
		expect(results.every((result) => result.status === "fulfilled")).toBe(true);
		const target = await scopedDb.activity.findFirstOrThrow({
			where: {
				dealId: fixture.assets.projectId,
				subject: "Target appointment",
			},
		});
		const asset = await scopedDb.artifact.findFirstOrThrow({
			where: { dealId: fixture.assets.projectId },
		});
		expect(target.archivedAt).not.toBeNull();
		expect(asset.activityId).not.toBeNull();
		expect(asset.version).toBe(2);
	});

	it("rejects an upload queued behind archive for a different actor", async () => {
		const { results } = await uploadRace("archive");
		expect(results[0]?.status).toBe("fulfilled");
		expect(results[1]?.status).toBe("rejected");
		if (results[1]?.status === "rejected")
			expect(results[1].reason).toMatchObject({ code: "APPOINTMENT_ARCHIVED" });
	});

	it("allows an upload queued first to finish after archive", async () => {
		const { target, results } = await uploadRace("upload");
		expect(results.every((result) => result.status === "fulfilled")).toBe(true);
		const uploadResult = results[0];
		if (uploadResult?.status !== "fulfilled")
			throw new Error("Upload did not start.");
		const upload = uploadResult.value as Awaited<
			ReturnType<AppointmentAssetsFixture["createUpload"]>
		>;
		await fixture.assets.put(upload.upload.id);
		await fixture.assets.service.confirmUpload(
			fixture.otherActor,
			fixture.assets.projectId,
			upload.upload.id,
			crypto.randomUUID(),
		);
		await fixture.assets.worker.process();
		expect(
			(
				await fixture.assets.service.getUpload(
					fixture.otherActor,
					fixture.assets.projectId,
					upload.upload.id,
				)
			).upload.status,
		).toBe("READY");
		expect(
			(
				await scopedDb.activity.findUnique({
					where: { id: target.appointment.id },
				})
			)?.archivedAt,
		).not.toBeNull();
	});
});
