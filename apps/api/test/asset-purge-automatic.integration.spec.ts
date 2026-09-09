import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { scopedDb as db } from "@crm/db/tenant-scope";
import {
	AssetPurgeFixture,
	createAssetPurgeFixture,
} from "./asset-purge.fixture";
import { inAssetTenant } from "./assets-tenant.fixture";

let fixture: AssetPurgeFixture;
let deals: AssetPurgeFixture["deals"];
let project: AssetPurgeFixture["project"];
let assetFixture: AssetPurgeFixture["assetFixture"];

describe("asset storage cleanup during automatic deal purge", () => {
	beforeAll(async () => {
		fixture = createAssetPurgeFixture();
		await fixture.setup();
		deals = fixture.deals;
		project = fixture.project;
		assetFixture = fixture.assetFixture;
	});

	afterAll(async () => {
		await fixture.clean();
	});
	it("keeps automatic purge jobs after the deal cascade", async () => {
		await inAssetTenant(async () => {
			const before = new Date("2026-09-01T00:00:00.000Z");
			const deleted = await project(
				"automatic-deleted",
				new Date("2026-08-01T00:00:00.000Z"),
			);
			const survivor = await project("automatic-survivor");
			const deletedAssets = await assetFixture(
				deleted.id,
				deleted.companyId,
				"automatic-deleted",
			);
			const survivorAssets = await assetFixture(
				survivor.id,
				survivor.companyId,
				"automatic-survivor",
			);

			expect(await deals.purgeExpired(before)).toMatchObject({
				requested: 1,
				succeeded: 1,
				skipped: 0,
				failed: 0,
			});

			expect(
				await db.deal.findUnique({ where: { id: deleted.id } }),
			).toBeNull();
			expect(
				await db.assetStorageJob.findMany({
					where: { projectId: deleted.id },
					select: { artifactId: true, uploadId: true, objectKey: true },
				}),
			).toHaveLength(3);
			expect(
				await db.assetUpload.findUnique({
					where: { id: deletedAssets.upload.id },
					select: { status: true },
				}),
			).toEqual({ status: "CANCELED" });

			expect(
				await db.deal.findUnique({ where: { id: survivor.id } }),
			).not.toBeNull();
			expect(
				await db.assetStorageJob.count({ where: { projectId: survivor.id } }),
			).toBe(0);
			expect(
				await db.artifact.findUnique({
					where: { id: survivorAssets.artifact.id },
				}),
			).not.toBeNull();
			expect(
				await db.assetUpload.findUnique({
					where: { id: survivorAssets.upload.id },
				}),
			).not.toBeNull();
		});
	});
});
