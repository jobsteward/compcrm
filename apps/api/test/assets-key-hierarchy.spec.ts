import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { db as rawDb } from "@crm/db";
import { runInTenant } from "@crm/db/tenant-context";
import { scopedDb as db } from "@crm/db/tenant-scope";
import {
	AssetsCoreFixture,
	assertLocalTestDatabase,
	assetTest as it,
} from "./assets-core.fixture";
import { ASSET_TEST_ORGANIZATION_ID } from "./assets-tenant.fixture";

describe("stored asset storage keys", () => {
	let fixture: AssetsCoreFixture;

	beforeAll(async () => {
		await assertLocalTestDatabase();
	});

	beforeEach(async () => {
		fixture = new AssetsCoreFixture();
		await fixture.setup();
	});

	afterEach(async () => {
		await fixture.cleanup();
	});

	afterAll(async () => {
		await db.$disconnect();
	});

	it("stores organization and project prefixes on each new upload", async () => {
		const created = await fixture.create();
		const upload = await db.assetUpload.findUniqueOrThrow({
			where: { id: created.upload.id },
		});
		expect(upload.organizationId).toBe(ASSET_TEST_ORGANIZATION_ID);
		expect(upload.projectId).toBe(fixture.projectId);
		expect(upload.temporaryKey).toBe(
			`temporary/${ASSET_TEST_ORGANIZATION_ID}/projects/${fixture.projectId}/${upload.id}`,
		);
		expect(upload.finalKey).toMatch(
			new RegExp(
				`^${ASSET_TEST_ORGANIZATION_ID}/projects/${fixture.projectId}/assets/[0-9a-f-]{36}$`,
			),
		);
	});

	it("denies a first tenant's upload from a second tenant", async () => {
		const created = await fixture.create();
		await fixture.put(created.upload.id);
		await fixture.service.updateAsset(
			fixture.actor,
			created.asset.id,
			{ uploadCompleted: true },
			randomUUID(),
		);
		await fixture.due();
		await fixture.worker.process();
		const ready = await fixture.service.getAsset(
			fixture.actor,
			created.asset.id,
		);
		expect(ready.asset.status).toBe("READY");
		const otherOrganizationId = `asset-key-other-${randomUUID()}`;
		await rawDb.organization.create({
			data: {
				id: otherOrganizationId,
				name: "Asset key other tenant",
				slug: otherOrganizationId,
				createdAt: new Date(),
			},
		});
		try {
			await expect(
				runInTenant(otherOrganizationId, () =>
					fixture.service.createProjectAsset(
						fixture.actor,
						fixture.projectId,
						fixture.metadata(),
						randomUUID(),
					),
				),
			).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
			await expect(
				runInTenant(otherOrganizationId, () =>
					fixture.service.updateAsset(
						fixture.actor,
						created.asset.id,
						{ uploadCompleted: true },
						randomUUID(),
					),
				),
			).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
			await expect(
				runInTenant(otherOrganizationId, () =>
					fixture.service.getAsset(fixture.actor, created.asset.id),
				),
			).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
		} finally {
			await rawDb.organization.delete({ where: { id: otherOrganizationId } });
		}
	});

	it("reuses stored keys and refreshes the transfer on idempotent creation", async () => {
		const key = randomUUID();
		const first = await fixture.create({}, key);
		const stored = await db.assetUpload.findUniqueOrThrow({
			where: { id: first.upload.id },
		});
		await db.assetUpload.update({
			where: { id: first.upload.id },
			data: { grantExpiresAt: new Date(0), reservationUntil: new Date(0) },
		});
		const replay = await fixture.create({}, key);
		const after = await db.assetUpload.findUniqueOrThrow({
			where: { id: first.upload.id },
		});
		expect(replay.upload.id).toBe(first.upload.id);
		expect(replay.transfer).not.toBeNull();
		expect(after.grantExpiresAt.getTime()).toBeGreaterThan(0);
		expect(after.temporaryKey).toBe(stored.temporaryKey);
		expect(after.finalKey).toBe(stored.finalKey);
	});

	it("completes and deletes an old pending upload with its stored keys", async () => {
		const created = await fixture.create();
		const legacyTemporaryKey = `temporary/${created.upload.id}`;
		const legacyFinalKey = `assets/${randomUUID()}`;
		await db.assetUpload.update({
			where: { id: created.upload.id },
			data: { temporaryKey: legacyTemporaryKey, finalKey: legacyFinalKey },
		});
		await db.artifact.update({
			where: { id: created.asset.id },
			data: { storageKey: legacyFinalKey },
		});
		fixture.storage.put(legacyTemporaryKey);
		await fixture.service.updateAsset(
			fixture.actor,
			created.asset.id,
			{ uploadCompleted: true },
			randomUUID(),
		);
		await fixture.due();
		await fixture.worker.process();
		const ready = await fixture.service.getAsset(
			fixture.actor,
			created.asset.id,
		);
		expect(ready.asset.status).toBe("READY");
		const assetId = ready.asset.id;
		const asset = await db.artifact.findUniqueOrThrow({
			where: { id: assetId },
		});
		expect(asset.storageKey).toBe(legacyFinalKey);
		expect(ready.download?.url).toContain(legacyFinalKey);
		await fixture.service.deleteAsset(fixture.actor, assetId, randomUUID());
		await fixture.due();
		await fixture.worker.process();
		expect(fixture.storage.objects.has(legacyFinalKey)).toBe(false);
	});
});
