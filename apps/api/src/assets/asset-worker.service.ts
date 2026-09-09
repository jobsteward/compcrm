import type { Db } from "@crm/db";
import { runInTenant } from "@crm/db/tenant-context";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { ASSETS } from "./asset-config";
import { AssetStorageService } from "./asset-storage.service";
import { removeAssetStorageJob } from "./asset-worker-delete";
import { LeaseLost, VerificationFailed } from "./asset-worker-errors";
import { finalizeAssetStorageJob } from "./asset-worker-finalize";
import {
	claimAssetStorageJob,
	startAssetStorageJobHeartbeat,
} from "./asset-worker-lease";
import { retryAssetStorageJob } from "./asset-worker-retry";
import { sweepExpiredAssetUploads } from "./asset-worker-sweep";

@Injectable()
export class AssetWorkerService {
	private readonly logger = new Logger(AssetWorkerService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly storage: AssetStorageService,
	) {}

	async process(externalSignal?: AbortSignal) {
		const deadline = Date.now() + ASSETS.worker.deadlineMs;
		const controller = new AbortController();
		const timer = setTimeout(
			() => controller.abort(),
			ASSETS.worker.deadlineMs,
		);
		const signal = externalSignal
			? AbortSignal.any([controller.signal, externalSignal])
			: controller.signal;
		try {
			const organizations = await this.db.organization.findMany({
				select: { id: true },
				orderBy: { id: "asc" },
			});
			let processed = 0;
			for (const organization of organizations) {
				if (
					processed >= ASSETS.worker.batchSize ||
					Date.now() >= deadline ||
					signal.aborted
				)
					break;
				processed += await runInTenant(organization.id, () =>
					this.processTenant(
						ASSETS.worker.batchSize - processed,
						deadline,
						signal,
					),
				);
			}
			return { processed };
		} finally {
			clearTimeout(timer);
		}
	}

	private async processTenant(
		limit: number,
		deadline: number,
		signal: AbortSignal,
	) {
		await sweepExpiredAssetUploads(this.db, signal);
		if (!this.storage.configured()) return 0;
		let processed = 0;
		while (processed < limit && Date.now() < deadline && !signal.aborted) {
			const job = await claimAssetStorageJob(this.db);
			if (!job) break;
			const stopHeartbeat = startAssetStorageJobHeartbeat(this.db, job);
			try {
				if (job.operation === "FINALIZE_UPLOAD")
					await finalizeAssetStorageJob(this.db, this.storage, job, signal);
				else await removeAssetStorageJob(this.db, this.storage, job, signal);
			} catch (error) {
				if (!(error instanceof LeaseLost))
					await retryAssetStorageJob(
						this.db,
						job,
						error instanceof VerificationFailed,
						this.logger,
						signal.aborted,
					);
			} finally {
				stopHeartbeat();
			}
			processed++;
		}
		return processed;
	}
}
