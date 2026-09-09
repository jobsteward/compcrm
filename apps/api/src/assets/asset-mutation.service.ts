import { createHash } from "node:crypto";
import type { Db, Prisma } from "@crm/db";
import type { z } from "zod";
import {
	findAssetProject,
	findAssetUpload,
	findProjectAsset,
	missing,
} from "./asset-access.service";
import { type AssetActor, assetActorKey } from "./asset-actor";
import { ASSETS } from "./asset-config";
import { AssetError } from "./asset-error";

export function hashAssetRequest(value: Prisma.InputJsonValue) {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class AssetMutations {
	constructor(private readonly db: Db) {}

	async run<T>(
		actor: AssetActor,
		projectId: string,
		operation: string,
		path: string,
		key: string,
		input: Prisma.InputJsonValue,
		schema: z.ZodType<T>,
		action: (
			tx: Prisma.TransactionClient,
			project: Awaited<ReturnType<typeof findAssetProject>>,
		) => Promise<T>,
		target?: {
			uploadId?: string;
			assetId?: string;
			activityId?: string | null;
			emailMessageId?: string;
		},
	) {
		if (!/^[\x20-\x7e]{1,128}$/.test(key ?? ""))
			throw new AssetError(
				400,
				"VALIDATION_ERROR",
				"A valid Idempotency-Key is required.",
			);
		const actorKey = assetActorKey(actor);
		const requestHash = hashAssetRequest(input);
		return this.db.$transaction(
			async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actorKey}, 0))`;
				const project = await findAssetProject(tx, actor, projectId, true);
				if (target?.uploadId)
					await findAssetUpload(tx, projectId, target.uploadId, actor);
				if (target?.assetId)
					await findProjectAsset(tx, projectId, target.assetId, actor);
				if (
					target?.activityId &&
					!(await tx.activity.findUnique({
						where: { id: target.activityId },
						select: { id: true },
					}))
				)
					missing();
				if (
					target?.emailMessageId &&
					!(await tx.emailMessage.findUnique({
						where: { id: target.emailMessageId },
						select: { id: true },
					}))
				)
					missing();
				const identity = { actorKey, operation, path, idempotencyKey: key };
				const prior = await tx.assetApiRequest.findUnique({
					where: { actorKey_operation_path_idempotencyKey: identity },
				});
				if (prior && prior.expiresAt > new Date()) {
					if (prior.requestHash !== requestHash)
						throw new AssetError(
							409,
							"IDEMPOTENCY_CONFLICT",
							"The idempotency key has different request data.",
						);
					return schema.parse(prior.responseBody);
				}
				const response = schema.parse(await action(tx, project));
				const data = {
					requestHash,
					responseStatus: 200,
					responseBody: JSON.parse(
						JSON.stringify(response),
					) as Prisma.InputJsonValue,
					expiresAt: new Date(Date.now() + ASSETS.replayMs),
				};
				await tx.assetApiRequest.upsert({
					where: { actorKey_operation_path_idempotencyKey: identity },
					create: { ...identity, ...data },
					update: data,
				});
				return response;
			},
			{ timeout: ASSETS.worker.leaseMs },
		);
	}
}
