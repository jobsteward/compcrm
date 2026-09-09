import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

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
	const deals = new DealsService(
		db,
		agent,
		new ActivityStampService(db),
		new ConversionService(db),
		new FieldsService(db, { fieldBackfill: async () => undefined } as never),
	);

	async function clean() {
		const companies = await db.company.findMany({
			where: { domain: { in: domains } },
			select: { id: true },
		});
		const companyIds = companies.map((company) => company.id);
		const projectIds = purgeKeys.map(
			(key) => `asset-purge-project-${key}-${suffix}`,
		);

		await db.assetStorageJob.deleteMany({
			where: { projectId: { in: projectIds } },
		});
		await db.assetEmailSource.deleteMany({
			where: { projectId: { in: projectIds } },
		});
		await db.assetUpload.deleteMany({
			where: { projectId: { in: projectIds } },
		});
		await db.artifact.deleteMany({ where: { dealId: { in: projectIds } } });
		await db.agentTask.deleteMany({ where: { dealId: { in: projectIds } } });
		await db.deal.deleteMany({ where: { id: { in: projectIds } } });
		await db.company.deleteMany({ where: { id: { in: companyIds } } });
		await db.user.deleteMany({ where: { id: ownerId } });
	}

	async function project(key: PurgeKey, archivedAt: Date | null = null) {
		const company = await db.company.create({
			data: {
				id: `asset-purge-company-${key}-${suffix}`,
				name: `Asset purge ${key} ${suffix}`,
				domain: `${key}-${suffix}.test`,
			},
			select: { id: true },
		});

		return db.deal.create({
			data: {
				id: `asset-purge-project-${key}-${suffix}`,
				name: `Asset purge project ${key} ${suffix}`,
				companyId: company.id,
				ownerId,
				archivedAt,
			},
			select: { id: true, companyId: true },
		});
	}

	async function assetFixture(
		projectId: string,
		companyId: string,
		key: string,
	) {
		const artifact = await db.artifact.create({
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
		const upload = await db.assetUpload.create({
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
