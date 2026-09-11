import { mock } from "bun:test";
import { UploadRunner } from "../components/crm/project-assets/upload-runner";
import type { UploadItem } from "../components/crm/project-assets/upload-session";
import { projectApi } from "../lib/project-assets/client";
import type { UploadGrant, UploadState } from "../lib/project-assets/schemas";

export function uploadFixture() {
	const grant: UploadGrant = {
		upload: {
			id: "upload",
			projectId: "project",
			customerId: "customer",
			status: "PENDING",
			expiresAt: "2099-01-01T00:00:00Z",
			assetId: null,
			failure: null,
		},
		transfer: {
			method: "PUT",
			url: "https://storage.example/file",
			headers: {},
			expiresAt: "2099-01-01T00:00:00Z",
			maxBytes: 100,
		},
	};
	const item: UploadItem = {
		id: "item",
		file: new File(["file"], "plan.txt", { type: "text/plain" }),
		kind: "document",
		activityId: null,
		createKey: "create",
		renewKey: "renew",
		confirmKey: "confirm",
		cancelKey: "cancel",
		uploadId: null,
		assetId: null,
		transfer: null,
		status: "QUEUED",
		error: null,
	};
	const api = {
		...projectApi,
		createUpload: mock(async () => grant),
		getUpload: mock(
			async (): Promise<UploadState> => ({
				upload: grant.upload,
				pollAfterSeconds: null,
			}),
		),
		renewUpload: mock(async () => grant),
		putTransfer: mock<typeof projectApi.putTransfer>(async () => {}),
		confirmUpload: mock(async () => ({
			uploadId: "upload",
			statusUrl: "/projects/project/asset-uploads/upload",
		})),
		cancelUpload: mock(async () => ({
			uploadId: "upload",
			status: "CANCELED" as const,
		})),
		pollUpload: mock(
			async (): Promise<UploadState> => ({
				upload: { ...grant.upload, status: "READY", assetId: "asset" },
				pollAfterSeconds: null,
			}),
		),
	};
	const changes: UploadItem[] = [];
	const ready = mock(() => {});
	const runner = new UploadRunner(
		"project",
		item,
		(updated) => changes.push(updated),
		ready,
		api,
		async () => {},
	);
	return { runner, api, grant, item, changes, ready };
}
