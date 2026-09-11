import { mock } from "bun:test";
import { UploadRunner } from "../components/crm/project-assets/upload-runner";
import type { UploadItem } from "../components/crm/project-assets/upload-session";
import { projectApi } from "../lib/project-assets/client";
import type {
	Asset,
	AssetCreation,
	AssetDetail,
} from "../lib/project-assets/schemas";

const timestamps = {
	createdAt: "2026-09-11T00:00:00Z",
	updatedAt: "2026-09-11T00:00:00Z",
};

function asset(status: Asset["status"], appointmentId: string | null): Asset {
	return {
		id: "asset",
		customerId: "customer",
		projectId: "project",
		appointmentId,
		fileName: "plan.txt",
		contentType: "text/plain",
		sizeBytes: 4,
		kind: "document",
		source: "MANUAL",
		emailSource: null,
		uploadedById: "user",
		durationMilliseconds: null,
		capturedAt: null,
		...timestamps,
		status,
		deletedAt: null,
		version: 1,
	};
}

export function uploadFixture(appointmentId: string | null = null) {
	const creation: AssetCreation = {
		asset: asset("UNVERIFIED", appointmentId),
		download: null,
		failure: null,
		transfer: {
			method: "PUT",
			url: "https://storage.example/file",
			headers: { "Content-Type": "text/plain", "Content-Length": "4" },
			expiresAt: "2099-01-01T00:00:00Z",
			maxBytes: 100,
		},
	};
	const ready: AssetDetail = {
		asset: asset("READY", appointmentId),
		download: {
			url: "https://storage.example/download",
			expiresAt: "2099-01-01T00:00:00Z",
		},
		failure: null,
	};
	const item: UploadItem = {
		id: "item",
		file: new File(["file"], "plan.txt", { type: "text/plain" }),
		kind: "document",
		appointmentId,
		createKey: "create",
		completeKey: "complete",
		deleteKey: "delete",
		transferred: false,
		assetId: null,
		transfer: null,
		status: "QUEUED",
		error: null,
	};
	const createProjectAsset = mock<typeof projectApi.createProjectAsset>(
		async (_projectId, _body, _idempotencyKey) => creation,
	);
	const createAppointmentAsset = mock<typeof projectApi.createAppointmentAsset>(
		async (_appointmentId, _body, _idempotencyKey) => creation,
	);
	const getAsset = mock<typeof projectApi.getAsset>(
		async (_assetId): Promise<AssetDetail> => ready,
	);
	const updateAsset = mock<typeof projectApi.updateAsset>(
		async (_assetId, _body, _idempotencyKey): Promise<AssetDetail> => ready,
	);
	const deleteAsset = mock<typeof projectApi.deleteAsset>(
		async (_assetId, _idempotencyKey) => ({
			assetId: "asset",
			status: "DELETING" as const,
		}),
	);
	const putTransfer = mock<typeof projectApi.putTransfer>(async () => {});
	const api = {
		...projectApi,
		createProjectAsset,
		createAppointmentAsset,
		getAsset,
		updateAsset,
		deleteAsset,
		putTransfer,
	};
	const changes: UploadItem[] = [];
	const onReady = mock(() => {});
	const delay = mock(async () => {});
	const runner = new UploadRunner(
		"project",
		item,
		(updated) => changes.push(updated),
		onReady,
		api,
		delay,
	);
	return { runner, api, creation, ready, item, changes, onReady, delay };
}
