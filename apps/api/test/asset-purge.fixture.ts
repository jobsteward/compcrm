import { randomUUID } from "node:crypto";
import { type Db, db } from "@crm/db";
import { scopedDb } from "@crm/db/tenant-scope";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";
import {
	addAssetTestMember,
	inAssetTenant,
	removeAssetTestMember,
} from "./assets-tenant.fixture";

export const purgeKeys = [
	"explicit-deleted",
	"explicit-survivor",
	"automatic-deleted",
	"automatic-survivor",
] as const;
export type PurgeKey = (typeof purgeKeys)[number];

export function createAssetPurgeFixture() {
	const suffix = `${process.env.TEST_RUN_ID ?? "asset-purge-spec"}-${randomUUID()}`;
	const ownerId = `asset-purge-owner-${suffix}`;
	const domains = purgeKeys.map((key) => `${key}-${suffix}.test`);
	const agent = {
		withCrmEvents: withDiscardedCrmEvents,
	} as unknown as AgentTriggerService;
	const serviceDb = scopedDb as unknown as Db;
	const dealService = new DealsService(
		serviceDb,
		agent,
		new ActivityStampService(serviceDb),
		new ConversionService(serviceDb),
		new FieldsService(serviceDb, {
			fieldBackfill: async () => undefined,
		} as never),
	);
	const deals = {
		purge: (id: string) => inAssetTenant(() => dealService.purge(id)),
		purgeExpired: (before: Date) =>
			inAssetTenant(() => dealService.purgeExpired(before)),
	};

	async function clean() {
		const companies = await inAssetTenant(() =>
			scopedDb.company.findMany({
				where: { domain: { in: domains } },
				select: { id: true },
			}),
		);
		const companyIds = companies.map((company) => company.id);
		const projectIds = purgeKeys.map(
			(key) => `asset-purge-project-${key}-${suffix}`,
		);

		await inAssetTenant(async () => {
			await scopedDb.assetStorageJob.deleteMany({
				where: { projectId: { in: projectIds } },
			});
			await scopedDb.assetEmailSource.deleteMany({
				where: { projectId: { in: projectIds } },
			});
			await scopedDb.assetUpload.deleteMany({
				where: { projectId: { in: projectIds } },
			});
			await scopedDb.artifact.deleteMany({
				where: { dealId: { in: projectIds } },
			});
			await scopedDb.agentTask.deleteMany({
				where: { dealId: { in: projectIds } },
			});
			await scopedDb.deal.deleteMany({ where: { id: { in: projectIds } } });
			await scopedDb.company.deleteMany({ where: { id: { in: companyIds } } });
		});
		await removeAssetTestMember(ownerId);
		await db.user.deleteMany({ where: { id: ownerId } });
	}

	async function project(key: PurgeKey, archivedAt: Date | null = null) {
		return inAssetTenant(async () => {
			const company = await scopedDb.company.create({
				data: {
					id: `asset-purge-company-${key}-${suffix}`,
					name: `Asset purge ${key} ${suffix}`,
					domain: `${key}-${suffix}.test`,
				},
				select: { id: true },
			});

			return scopedDb.deal.create({
				data: {
					id: `asset-purge-project-${key}-${suffix}`,
					name: `Asset purge project ${key} ${suffix}`,
					companyId: company.id,
					ownerId,
					archivedAt,
				},
				select: { id: true, companyId: true },
			});
		});
	}

	async function assetFixture(
		projectId: string,
		companyId: string,
		key: string,
	) {
		return inAssetTenant(async () => {
			const artifact = await scopedDb.artifact.create({
				data: {
					id: `asset-purge-artifact-${key}-${suffix}`,
					dealId: projectId,
					type: "file",
					fileName: `${key}.txt`,
					storageKey: `projects/${projectId}/${key}.txt`,
					storageBucket: "crm-assets",
				},
				select: { id: true, storageKey: true },
			});

			const now = Date.now();
			const upload = await scopedDb.assetUpload.create({
				data: {
					id: `asset-purge-upload-${key}-${suffix}`,
					projectId,
					customerId: companyId,
					actorKey: `user:${ownerId}`,
					fileName: `${key}-upload.txt`,
					contentType: "text/plain",
					sizeBytes: 32n,
					kind: "file",
					source: "MANUAL",
					metadataHash: `metadata-${key}-${suffix}`,
					bucket: "crm-assets",
					temporaryKey: `temporary/${projectId}/${key}.txt`,
					finalKey: `projects/${projectId}/${key}-upload.txt`,
					expiresAt: new Date(now + 60 * 60_000),
					grantExpiresAt: new Date(now + 60 * 60_000),
					reservationUntil: new Date(now + 60 * 60_000),
				},
				select: { id: true, temporaryKey: true, finalKey: true },
			});

			return { artifact, upload };
		});
	}

	async function setup() {
		await clean();
		await db.user.create({
			data: {
				id: ownerId,
				name: "Asset purge owner",
				email: `${ownerId}@example.test`,
				emailVerified: true,
			},
		});
		await addAssetTestMember(ownerId, randomUUID());
	}

	return {
		suffix,
		ownerId,
		keys: purgeKeys,
		deals,
		clean,
		setup,
		project,
		assetFixture,
	};
}

export type AssetPurgeFixture = ReturnType<typeof createAssetPurgeFixture>;
