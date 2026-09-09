import { randomUUID } from "node:crypto";
import type {
	AssetStorageJobModel as AssetStorageJob,
	Db,
	Prisma,
} from "@crm/db";
import { ASSETS } from "./asset-config";
import { LeaseLost } from "./asset-worker-errors";

type Tx = Prisma.TransactionClient;

export async function assertAssetStorageJobLease(tx: Tx, job: AssetStorageJob) {
	const rows = await tx.$queryRaw<
		Array<{ id: string }>
	>`SELECT "id" FROM "assetStorageJob" WHERE "id" = ${job.id} AND "leaseToken" = ${job.leaseToken} AND "leaseUntil" > (NOW() AT TIME ZONE 'UTC') AND "state" = 'RUNNING' FOR UPDATE`;
	if (!rows.length) throw new LeaseLost();
}

export async function withOwnedAssetStorageJob<T>(
	db: Db,
	job: AssetStorageJob,
	action: (tx: Tx) => Promise<T>,
) {
	return db.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT "id" FROM "deal" WHERE "id" = ${job.projectId} FOR UPDATE`;
		await assertAssetStorageJobLease(tx, job);
		return action(tx);
	});
}

export async function completeAssetStorageJob(tx: Tx, job: AssetStorageJob) {
	await tx.assetStorageJob.update({
		where: { id: job.id },
		data: {
			state: "COMPLETE",
			leaseUntil: null,
			leaseToken: null,
			lastError: null,
			nextAttemptAt: new Date(Date.now() + ASSETS.worker.retryMaxMs),
		},
	});
}

export async function claimAssetStorageJob(db: Db) {
	const leaseToken = randomUUID();
	return db.$transaction(async (tx) => {
		const rows = await tx.$queryRaw<
			Array<{ id: string }>
		>`SELECT "id" FROM "assetStorageJob" WHERE ("state" = 'PENDING' AND "nextAttemptAt" <= (NOW() AT TIME ZONE 'UTC')) OR ("state" = 'RUNNING' AND "leaseUntil" <= (NOW() AT TIME ZONE 'UTC')) OR ("state" = 'COMPLETE' AND "operation" = 'DELETE_OBJECT' AND "nextAttemptAt" <= (NOW() AT TIME ZONE 'UTC')) ORDER BY "nextAttemptAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1`;
		if (!rows[0]) return null;
		return tx.assetStorageJob.update({
			where: { id: rows[0].id },
			data: {
				state: "RUNNING",
				leaseToken,
				leaseUntil: new Date(Date.now() + ASSETS.worker.leaseMs),
			},
		});
	});
}

export function startAssetStorageJobHeartbeat(db: Db, job: AssetStorageJob) {
	let heartbeatPending = false;
	const heartbeat = setInterval(() => {
		if (heartbeatPending) return;
		heartbeatPending = true;
		void db.assetStorageJob
			.updateMany({
				where: {
					id: job.id,
					state: "RUNNING",
					leaseToken: job.leaseToken,
					leaseUntil: { gt: new Date() },
				},
				data: {
					leaseUntil: new Date(Date.now() + ASSETS.worker.leaseMs),
				},
			})
			.catch(() => {})
			.finally(() => {
				heartbeatPending = false;
			});
	}, ASSETS.worker.heartbeatMs);
	return () => clearInterval(heartbeat);
}
