import type { Db, Prisma } from "@crm/db";
import { scopedTransaction } from "@crm/db/tenant-scope";
import {
	findAssetProject,
	findProjectAsset,
	missing,
} from "./asset-access.service";
import type { AssetActor } from "./asset-actor";
import { AssetError } from "./asset-error";
import { assetResponse } from "./asset-responses";
import {
	type AssetListInput,
	assetListInput,
	customerAssetListInput,
} from "./assets.contracts";

export class AssetCatalog {
	constructor(private readonly db: Db) {}

	async listCustomerAssets(
		actor: AssetActor,
		customerId: string,
		raw: AssetListInput,
	) {
		const input = customerAssetListInput.parse(raw);
		return scopedTransaction(this.db, async (tx) => {
			if (
				!(await tx.company.findUnique({
					where: { id: customerId },
					select: { id: true },
				}))
			)
				missing();
			if (actor.type === "SYSTEM") missing();
			if (
				!(await tx.user.findUnique({
					where: { id: actor.userId },
					select: { id: true },
				}))
			)
				missing();
			if (input.projectId) {
				const project = await findAssetProject(tx, actor, input.projectId);
				if (project.companyId !== customerId)
					throw new AssetError(
						409,
						"PROJECT_MISMATCH",
						"The project belongs to another customer.",
					);
			}
			return this.list(
				tx,
				{ deal: { companyId: customerId }, dealId: input.projectId },
				input,
			);
		});
	}

	async listProjectAssets(
		actor: AssetActor,
		projectId: string,
		raw: AssetListInput,
	) {
		const input = assetListInput.parse(raw);
		return scopedTransaction(this.db, async (tx) => {
			await findAssetProject(tx, actor, projectId);
			return this.list(
				tx,
				{
					dealId: projectId,
					emailMessageId: actor.type === "SYSTEM" ? actor.messageId : undefined,
				},
				input,
			);
		});
	}

	private async list(
		tx: Prisma.TransactionClient,
		parent: Prisma.ArtifactWhereInput,
		input: AssetListInput,
	) {
		const where: Prisma.ArtifactWhereInput = {
			...parent,
			status: { in: ["READY", "UNVERIFIED"] },
			activityId: input.activityId,
			kind: input.kind,
			source: input.source,
		};
		const total = await tx.artifact.count({ where });
		const offset = (input.page - 1) * input.pageSize;
		if (offset >= total)
			return {
				items: [],
				page: input.page,
				pageSize: input.pageSize,
				total,
				hasNextPage: false,
			};
		const items = await tx.artifact.findMany({
			where,
			include: { deal: { select: { companyId: true } } },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			skip: offset,
			take: input.pageSize,
		});
		return {
			items: items.map(assetResponse),
			page: input.page,
			pageSize: input.pageSize,
			total,
			hasNextPage: input.page * input.pageSize < total,
		};
	}

	async getAsset(actor: AssetActor, projectId: string, assetId: string) {
		return scopedTransaction(this.db, async (tx) => {
			await findAssetProject(tx, actor, projectId);
			return {
				asset: assetResponse(
					await findProjectAsset(tx, projectId, assetId, actor),
				),
			};
		});
	}
}
