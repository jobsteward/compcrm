import type {
	AppointmentCreateBody,
	AppointmentStatus,
	AppointmentUpdateBody,
	Asset,
	AssetUpdateBody,
	UploadCreateBody,
	UploadGrant,
	UploadState,
} from "./schemas";
import {
	appointmentArchiveSchema,
	appointmentDetailSchema,
	appointmentListSchema,
	assetDeletionSchema,
	assetDetailSchema,
	assetDownloadSchema,
	assetListSchema,
	uploadCancellationSchema,
	uploadConfirmationSchema,
	uploadGrantSchema,
	uploadStateSchema,
} from "./schemas";
import { projectPath, query, request, statusPath } from "./transport";

export type AppointmentFilters = {
	page: number;
	pageSize: number;
	status?: AppointmentStatus;
	ownerId?: string;
	from?: string;
	to?: string;
	archived?: boolean;
};

export type AssetFilters = {
	page: number;
	pageSize: number;
	activityId?: string;
	kind?: string;
	source?: "MANUAL" | "MOBILE_RECORDING" | "EMAIL_ATTACHMENT";
};

export const projectApi = {
	listAppointments(projectId: string, filters: AppointmentFilters) {
		const suffix = query(filters);
		return request(
			`${projectPath(projectId, "appointments")}${suffix ? `?${suffix}` : ""}`,
			appointmentListSchema,
		);
	},
	getAppointment(projectId: string, appointmentId: string) {
		return request(
			`${projectPath(projectId, "appointments")}/${encodeURIComponent(appointmentId)}`,
			appointmentDetailSchema,
		);
	},
	createAppointment(
		projectId: string,
		body: AppointmentCreateBody,
		idempotencyKey: string,
	) {
		return request(
			projectPath(projectId, "appointments"),
			appointmentDetailSchema,
			{ method: "POST", body, idempotencyKey },
		);
	},
	updateAppointment(
		projectId: string,
		appointmentId: string,
		body: AppointmentUpdateBody,
		idempotencyKey: string,
	) {
		return request(
			`${projectPath(projectId, "appointments")}/${encodeURIComponent(appointmentId)}`,
			appointmentDetailSchema,
			{ method: "PATCH", body, idempotencyKey },
		);
	},
	archiveAppointment(
		projectId: string,
		appointmentId: string,
		idempotencyKey: string,
	) {
		return request(
			`${projectPath(projectId, "appointments")}/${encodeURIComponent(appointmentId)}`,
			appointmentArchiveSchema,
			{ method: "DELETE", idempotencyKey },
		);
	},
	listAssets(projectId: string, filters: AssetFilters) {
		const suffix = query(filters);
		return request(
			`${projectPath(projectId, "assets")}${suffix ? `?${suffix}` : ""}`,
			assetListSchema,
		);
	},
	getAsset(projectId: string, assetId: string) {
		return request(
			`${projectPath(projectId, "assets")}/${encodeURIComponent(assetId)}`,
			assetDetailSchema,
		);
	},
	updateAsset(
		projectId: string,
		assetId: string,
		body: AssetUpdateBody,
		idempotencyKey: string,
	) {
		return request(
			`${projectPath(projectId, "assets")}/${encodeURIComponent(assetId)}`,
			assetDetailSchema,
			{ method: "PATCH", body, idempotencyKey },
		);
	},
	downloadAsset(projectId: string, assetId: string) {
		return request(
			`${projectPath(projectId, "assets")}/${encodeURIComponent(assetId)}/download`,
			assetDownloadSchema,
		);
	},
	deleteAsset(projectId: string, assetId: string, idempotencyKey: string) {
		return request(
			`${projectPath(projectId, "assets")}/${encodeURIComponent(assetId)}`,
			assetDeletionSchema,
			{ method: "DELETE", idempotencyKey },
		);
	},
	createUpload(
		projectId: string,
		body: UploadCreateBody,
		idempotencyKey: string,
	): Promise<UploadGrant> {
		return request(projectPath(projectId, "asset-uploads"), uploadGrantSchema, {
			method: "POST",
			body,
			idempotencyKey,
		});
	},
	getUpload(projectId: string, uploadId: string): Promise<UploadState> {
		return request(
			`${projectPath(projectId, "asset-uploads")}/${encodeURIComponent(uploadId)}`,
			uploadStateSchema,
		);
	},
	renewUpload(
		projectId: string,
		uploadId: string,
		idempotencyKey: string,
	): Promise<UploadGrant> {
		return request(
			`${projectPath(projectId, "asset-uploads")}/${encodeURIComponent(uploadId)}/url`,
			uploadGrantSchema,
			{ method: "POST", body: {}, idempotencyKey },
		);
	},
	confirmUpload(projectId: string, uploadId: string, idempotencyKey: string) {
		return request(
			`${projectPath(projectId, "asset-uploads")}/${encodeURIComponent(uploadId)}/confirm`,
			uploadConfirmationSchema,
			{ method: "POST", body: {}, idempotencyKey },
		);
	},
	cancelUpload(projectId: string, uploadId: string, idempotencyKey: string) {
		return request(
			`${projectPath(projectId, "asset-uploads")}/${encodeURIComponent(uploadId)}`,
			uploadCancellationSchema,
			{ method: "DELETE", idempotencyKey },
		);
	},
	putTransfer(
		transfer: NonNullable<UploadGrant["transfer"]>,
		file: File,
		signal?: AbortSignal,
	) {
		return fetch(transfer.url, {
			method: transfer.method,
			headers: transfer.headers,
			body: file,
			credentials: "omit",
			signal,
		}).then((response) => {
			if (!response.ok) throw new Error("The file transfer failed.");
		});
	},
	pollUpload(path: string) {
		return request(path, uploadStateSchema);
	},
	statusPath,
};

export type { AppointmentStatus, Asset };
