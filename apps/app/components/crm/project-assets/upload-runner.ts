import { projectApi } from "@/lib/project-assets/client";
import { PROJECT_ASSETS } from "@/lib/project-assets/config";
import type { AssetDetail } from "@/lib/project-assets/schemas";
import type { UploadItem } from "./upload-session";

export class UploadRunner {
	private running = false;
	private canceled = false;
	private transferController: AbortController | null = null;
	constructor(
		private readonly projectId: string,
		private item: UploadItem,
		private readonly changed: (item: UploadItem) => void,
		private readonly ready: () => void,
		private readonly api = projectApi,
		private readonly delay = (milliseconds: number) =>
			new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
	) {}

	private patch(patch: Partial<UploadItem>) {
		this.item = { ...this.item, ...patch };
		this.changed(this.item);
	}

	async cancel() {
		this.canceled = true;
		this.transferController?.abort();
		if (!this.running) await this.run();
	}

	private async cancelIfRequested(assetId: string) {
		if (!this.canceled) return false;
		await this.api.deleteAsset(assetId, this.item.deleteKey);
		this.patch({ status: "CANCELED", error: null });
		this.ready();
		return true;
	}

	private finished(result: AssetDetail) {
		if (result.failure) throw new Error(result.failure.message);
		if (result.asset.status === "READY") {
			this.patch({ status: "READY", assetId: result.asset.id, error: null });
			this.ready();
			return true;
		}
		if (["DELETING", "DELETED"].includes(result.asset.status)) {
			this.patch({ status: "CANCELED", error: null });
			this.ready();
			return true;
		}
		return false;
	}

	private async poll(assetId: string) {
		this.patch({ status: "FINALIZING" });
		for (
			let attempt = 0;
			attempt < PROJECT_ASSETS.upload.pollAttempts;
			attempt += 1
		) {
			if (await this.cancelIfRequested(assetId)) return;
			if (this.finished(await this.api.getAsset(assetId))) return;
			await this.delay(PROJECT_ASSETS.upload.pollSeconds * 1000);
		}
		throw new Error(
			"The file is still being verified. Retry to check its status.",
		);
	}

	async run() {
		if (this.running || ["READY", "CANCELED"].includes(this.item.status))
			return;
		this.running = true;
		this.patch({ status: "UPLOADING", error: null });
		try {
			let assetId = this.item.assetId;
			if (!assetId || !this.item.transferred) {
				const body = {
					fileName: this.item.file.name,
					contentType: this.item.file.type || "application/octet-stream",
					sizeBytes: this.item.file.size,
					kind: this.item.kind,
					source: "MANUAL" as const,
				};
				const created = this.item.appointmentId
					? await this.api.createAppointmentAsset(
							this.item.appointmentId,
							body,
							this.item.createKey,
						)
					: await this.api.createProjectAsset(
							this.projectId,
							body,
							this.item.createKey,
						);
				assetId = created.asset.id;
				this.patch({ assetId, transfer: created.transfer });
				if (await this.cancelIfRequested(assetId)) return;
				if (this.finished(created)) return;
				if (!created.transfer) {
					await this.poll(assetId);
					return;
				}
				if (Date.parse(created.transfer.expiresAt) <= Date.now())
					throw new Error("Upload authorization expired. Retry to refresh it.");
				if (created.transfer.maxBytes < this.item.file.size)
					throw new Error("The file exceeds the upload limit.");
				this.transferController = new AbortController();
				await this.api.putTransfer(
					created.transfer,
					this.item.file,
					this.transferController.signal,
				);
				this.patch({ transferred: true });
			}
			if (await this.cancelIfRequested(assetId)) return;
			await this.api.updateAsset(
				assetId,
				{ uploadCompleted: true },
				this.item.completeKey,
			);
			await this.poll(assetId);
		} catch (error) {
			let failure = error;
			if (this.canceled && this.item.assetId) {
				try {
					await this.cancelIfRequested(this.item.assetId);
					return;
				} catch (deleteError) {
					failure = deleteError;
				}
			}
			this.patch({
				status: "FAILED",
				error:
					failure instanceof Error ? failure.message : "The upload failed.",
			});
		} finally {
			this.transferController = null;
			this.running = false;
		}
	}
}
