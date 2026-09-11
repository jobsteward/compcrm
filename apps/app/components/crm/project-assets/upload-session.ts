import type { AssetCreation } from "@/lib/project-assets/schemas";

export type UploadItemStatus =
	| "QUEUED"
	| "UPLOADING"
	| "FINALIZING"
	| "READY"
	| "FAILED"
	| "CANCELED";

export type UploadItem = {
	id: string;
	file: File;
	kind: string;
	appointmentId: string | null;
	createKey: string;
	completeKey: string;
	deleteKey: string;
	transferred: boolean;
	assetId: string | null;
	transfer: AssetCreation["transfer"];
	status: UploadItemStatus;
	error: string | null;
};
