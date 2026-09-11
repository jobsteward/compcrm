import { projectApi } from "@/lib/project-assets/client";
import { PROJECT_ASSETS } from "@/lib/project-assets/config";
import { operationKey } from "@/lib/project-assets/transport";
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

	private async cancelIfRequested(uploadId: string) {
		if (!this.canceled) return false;
		await this.api.cancelUpload(this.projectId, uploadId, this.item.cancelKey);
		this.patch({ status: "CANCELED", error: null });
		return true;
	}

	private async poll(uploadId: string) {
		const path = this.api.statusPath(
			`/projects/${this.projectId}/asset-uploads/${uploadId}`,
			this.projectId,
			uploadId,
		);
		for (
			let attempt = 0;
			attempt < PROJECT_ASSETS.upload.pollAttempts;
			attempt += 1
		) {
			const state = await this.api.pollUpload(path);
			if (state.upload.status === "READY") {
				this.patch({
					status: "READY",
					assetId: state.upload.assetId,
					error: null,
				});
				this.ready();
				return;
			}
			if (["FAILED", "CANCELED", "EXPIRED"].includes(state.upload.status))
				throw new Error(
					state.upload.failure?.message ??
						`Upload is ${state.upload.status.toLowerCase()}. Submit the file again.`,
				);
			await this.delay(
				(state.pollAfterSeconds ?? PROJECT_ASSETS.upload.pollSeconds) * 1000,
			);
		}
		throw new Error(
			"The upload is still processing. Retry to check its status.",
		);
	}

	async run() {
		if (this.running || ["READY", "CANCELED"].includes(this.item.status))
			return;
		this.running = true;
		this.patch({ status: "UPLOADING", error: null });
		try {
			let uploadId = this.item.uploadId;
			if (uploadId) {
				const current = await this.api.getUpload(this.projectId, uploadId);
				if (current.upload.status === "READY") {
					this.patch({ status: "READY", assetId: current.upload.assetId });
					this.ready();
					return;
				}
				if (current.upload.status === "FINALIZING") {
					this.patch({ status: "FINALIZING" });
					await this.poll(uploadId);
					return;
				}
				if (current.upload.status === "CANCELED") {
					this.patch({ status: "CANCELED" });
					return;
				}
				if (["FAILED", "EXPIRED"].includes(current.upload.status))
					throw new Error(
						current.upload.failure?.message ??
							"Upload expired or failed. Submit the file again.",
					);
			} else {
				const grant = await this.api.createUpload(
					this.projectId,
					{
						fileName: this.item.file.name,
						contentType: this.item.file.type || "application/octet-stream",
						sizeBytes: this.item.file.size,
						kind: this.item.kind,
						source: "MANUAL",
						activityId: this.item.activityId,
					},
					this.item.createKey,
				);
				uploadId = grant.upload.id;
				this.patch({ uploadId, transfer: grant.transfer });
			}
			if (await this.cancelIfRequested(uploadId)) return;
			for (
				let attempt = 0;
				attempt < PROJECT_ASSETS.upload.renewalAttempts;
				attempt += 1
			) {
				if (
					this.item.transfer &&
					Date.parse(this.item.transfer.expiresAt) > Date.now()
				)
					break;
				const grant = await this.api.renewUpload(
					this.projectId,
					uploadId,
					this.item.renewKey,
				);
				this.patch({ transfer: grant.transfer, renewKey: operationKey() });
				if (await this.cancelIfRequested(uploadId)) return;
			}
			const transfer = this.item.transfer;
			if (!transfer || Date.parse(transfer.expiresAt) <= Date.now())
				throw new Error(
					"The upload has no active transfer grant. Retry to renew it.",
				);
			if (transfer.maxBytes < this.item.file.size)
				throw new Error("The file exceeds the upload limit.");
			this.transferController = new AbortController();
			await this.api.putTransfer(
				transfer,
				this.item.file,
				this.transferController.signal,
			);
			if (await this.cancelIfRequested(uploadId)) return;
			this.patch({ status: "FINALIZING" });
			const confirmation = await this.api.confirmUpload(
				this.projectId,
				uploadId,
				this.item.confirmKey,
			);
			this.api.statusPath(confirmation.statusUrl, this.projectId, uploadId);
			await this.poll(uploadId);
		} catch (error) {
			let failure = error;
			if (this.canceled && this.item.uploadId) {
				try {
					await this.cancelIfRequested(this.item.uploadId);
					return;
				} catch (cancelError) {
					failure = cancelError;
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
