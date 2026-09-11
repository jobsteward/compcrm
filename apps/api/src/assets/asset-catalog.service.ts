import type { Db, Prisma } from "@crm/db";
import { scopedTransaction } from "@crm/db/tenant-scope";
import {
	findAssetProject,
	findProjectAsset,
	validateAssetAppointment,
} from "./asset-access.service";
import type { AssetActor } from "./asset-actor";
import { assetProjectId } from "./asset-context.service";
import { downloadAssetFile } from "./asset-files.service";
import { assetResponse } from "./asset-responses";
import type { AssetStorageService } from "./asset-storage.service";
import {
	type AssetListInput,
	assetDetailSchema,
	assetListInput,
} from "./assets.contracts";

export class AssetCatalog {
	constructor(
		private readonly db: Db,
		private readonly storage: AssetStorageService,
	) {}

	async listProjectAssets(
		actor: AssetActor,
		projectId: string,
		raw: AssetListInput,
		appointmentId?: string,
	) {
		const input = assetListInput.parse(raw);
		return scopedTransaction(this.db, async (tx) => {
			await findAssetProject(tx, actor, projectId);
			if (appointmentId)
				await validateAssetAppointment(tx, projectId, appointmentId, false);
			return this.list(
				tx,
				{
					dealId: projectId,
					activityId: appointmentId,
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
			kind: input.kind,
			source: input.source,
		};
		const total = await tx.artifact.count({ where });
		const offset = (input.page - 1) * input.pageSize;
		const items =
			offset >= total
				? []
				: await tx.artifact.findMany({
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

	async getAsset(actor: AssetActor, assetId: string) {
		const projectId = await assetProjectId(this.db, actor, assetId);
		return scopedTransaction(this.db, async (tx) => {
			await findAssetProject(tx, actor, projectId, true);
			const asset = await findProjectAsset(tx, projectId, assetId, actor);
			const upload = await tx.assetUpload.findUnique({ where: { assetId } });
			const expired =
				upload?.status === "EXPIRED" ||
				(upload?.status === "PENDING" && upload.expiresAt <= new Date());
			const failure =
				asset.status !== "UNVERIFIED"
					? null
					: expired
						? {
								code: "UPLOAD_EXPIRED",
								message:
									"The upload expired. Create a new asset to send the file again.",
							}
						: upload?.failureCode
							? {
									code: upload.failureCode,
									message: upload.failureMessage ?? "File verification failed.",
								}
							: null;
			return assetDetailSchema.parse({
				asset: assetResponse(asset),
				failure,
				download: await downloadAssetFile(this.storage, asset),
			});
		});
	}
}
