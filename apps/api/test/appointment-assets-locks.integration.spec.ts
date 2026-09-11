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
	let releaseLock!: () => void;
	const released = new Promise<void>((resolve) => {
		releaseLock = resolve;
	});
	let acquired!: () => void;
	const lockAcquired = new Promise<void>((resolve) => {
		acquired = resolve;
	});
	const transaction = rawDb.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
		await tx.$queryRaw`SELECT "id" FROM "deal" WHERE "id" = ${projectId} FOR UPDATE`;
		acquired();
		await released;
	});
	await lockAcquired;
	let open = true;
	return {
		async waitFor(waiters: number) {
			for (let attempt = 0; attempt < 200; attempt++) {
				const result = await rawDb.$queryRaw<{ count: number }[]>`
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
		},
	};
}

async function associationRace(order: "archive" | "create") {
	const target = await fixture.appointment({ title: "Target appointment" });
	const gate = await lockedProject(
		fixture.assets.projectId,
		ASSET_TEST_ORGANIZATION_ID,
	);
	const operations: Promise<unknown>[] = [];
	let released = false;
	const archive = () => fixture.archive(target.appointment.id, fixture.actor);
	const create = () =>
		fixture.createUpload(
			{ appointmentId: target.appointment.id },
			fixture.otherActor,
		);
	try {
		operations.push(order === "archive" ? archive() : create());
		await gate.waitFor(1);
		operations.push(order === "archive" ? create() : archive());
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

	it("rejects an appointment asset association queued behind archive", async () => {
		const { results } = await associationRace("archive");
		expect(results[0]?.status).toBe("fulfilled");
		expect(results[1]?.status).toBe("rejected");
		if (results[1]?.status === "rejected")
			expect(results[1].reason).toMatchObject({ code: "APPOINTMENT_ARCHIVED" });
	});

	it("preserves an accepted same-project association before archive", async () => {
		const { target, results } = await associationRace("create");
		expect(results.every((result) => result.status === "fulfilled")).toBe(true);
		const created = results[0];
		if (created?.status !== "fulfilled")
			throw new Error("Appointment asset creation did not start.");
		const upload = created.value as Awaited<
			ReturnType<AppointmentAssetsFixture["createUpload"]>
		>;
		expect(upload.asset).toMatchObject({
			projectId: fixture.assets.projectId,
			appointmentId: target.appointment.id,
			status: "UNVERIFIED",
		});
		await fixture.assets.put(upload.upload.id);
		await fixture.updateAsset(
			upload.asset.id,
			{ uploadCompleted: true },
			fixture.otherActor,
		);
		await fixture.assets.worker.process();
		expect(
			(
				await fixture.assets.service.getAsset(
					fixture.otherActor,
					upload.asset.id,
				)
			).asset,
		).toMatchObject({
			projectId: fixture.assets.projectId,
			appointmentId: target.appointment.id,
			status: "READY",
		});
		expect(
			(
				await scopedDb.activity.findUnique({
					where: { id: target.appointment.id },
				})
			)?.archivedAt,
		).not.toBeNull();
	});
});
