import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	AssetPurgeFixture,
	createAssetPurgeFixture,
} from "./asset-purge.fixture";

let fixture: AssetPurgeFixture;
let deals: AssetPurgeFixture["deals"];
let project: AssetPurgeFixture["project"];
let assetFixture: AssetPurgeFixture["assetFixture"];
let suffix: AssetPurgeFixture["suffix"];

describe("asset storage cleanup during explicit deal purge", () => {
	beforeAll(async () => {
		fixture = createAssetPurgeFixture();
		await fixture.setup();
		deals = fixture.deals;
		project = fixture.project;
		assetFixture = fixture.assetFixture;
		suffix = fixture.suffix;
	});

	afterAll(async () => {
		await fixture.clean();
	});
	it("keeps explicit purge jobs and isolates another project", async () => {
		const deleted = await project("explicit-deleted");
		const survivor = await project("explicit-survivor");
		const deletedAssets = await assetFixture(
			deleted.id,
			deleted.companyId,
			"explicit-deleted",
		);
		const survivorAssets = await assetFixture(
			survivor.id,
			survivor.companyId,
			"explicit-survivor",
		);

		await expect(deals.purge(deleted.id)).resolves.toEqual({
			id: deleted.id,
			name: `Asset purge project explicit-deleted ${suffix}`,
		});

		const jobs = await db.assetStorageJob.findMany({
			where: { projectId: deleted.id },
			orderBy: { operationKey: "asc" },
			select: {
				operationKey: true,
				projectId: true,
				uploadId: true,
				artifactId: true,
				bucket: true,
				objectKey: true,
				temporary: true,
			},
		});

		expect(jobs).toEqual([
			{
				operationKey: `artifact:${deletedAssets.artifact.id}`,
				projectId: deleted.id,
				uploadId: null,
				artifactId: deletedAssets.artifact.id,
				bucket: "crm-assets",
				objectKey: deletedAssets.artifact.storageKey,
				temporary: false,
			},
			{
				operationKey: `orphan:${deletedAssets.upload.id}`,
				projectId: deleted.id,
				uploadId: deletedAssets.upload.id,
				artifactId: null,
				bucket: "crm-assets",
				objectKey: deletedAssets.upload.finalKey,
				temporary: false,
			},
			{
				operationKey: `temporary:${deletedAssets.upload.id}`,
				projectId: deleted.id,
				uploadId: deletedAssets.upload.id,
				artifactId: null,
				bucket: "crm-assets",
				objectKey: deletedAssets.upload.temporaryKey,
				temporary: true,
			},
		]);

		expect(await db.deal.findUnique({ where: { id: deleted.id } })).toBeNull();
		expect(
			await db.artifact.findUnique({
				where: { id: deletedAssets.artifact.id },
			}),
		).toBeNull();
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
