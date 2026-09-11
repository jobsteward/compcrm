import type { UploadGrant } from "@/lib/project-assets/schemas";

export type UploadItemStatus =
	| "QUEUED"
	| "UPLOADING"
	| "FINALIZING"
	| "READY"
	| "FAILED"
	| "CANCELED"
	| "EXPIRED";

export type UploadItem = {
	id: string;
	file: File;
	kind: string;
	activityId: string | null;
	createKey: string;
	renewKey: string;
	confirmKey: string;
	cancelKey: string;
	uploadId: string | null;
	assetId: string | null;
	transfer: UploadGrant["transfer"];
	status: UploadItemStatus;
	error: string | null;
};
