import type {
	AppointmentCreateBody,
	AppointmentStatus,
	AppointmentUpdateBody,
	Asset,
	AssetCreateBody,
	AssetCreation,
	AssetUpdateBody,
} from "./schemas";
import {
	appointmentArchiveSchema,
	appointmentDetailSchema,
	appointmentListSchema,
	assetCreationSchema,
	assetDeletionSchema,
	assetDetailSchema,
	assetListSchema,
} from "./schemas";
import { projectPath, query, request } from "./transport";

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
	appointmentId?: string;
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
		const { appointmentId, ...params } = filters;
		const path = appointmentId
			? `/appointments/${encodeURIComponent(appointmentId)}/assets`
			: projectPath(projectId, "assets");
		const suffix = query(params);
		return request(`${path}${suffix ? `?${suffix}` : ""}`, assetListSchema);
	},
	getAsset(assetId: string) {
		return request(`/assets/${encodeURIComponent(assetId)}`, assetDetailSchema);
	},
	updateAsset(assetId: string, body: AssetUpdateBody, idempotencyKey: string) {
		return request(
			`/assets/${encodeURIComponent(assetId)}`,
			assetDetailSchema,
			{ method: "PATCH", body, idempotencyKey },
		);
	},
	deleteAsset(assetId: string, idempotencyKey: string) {
		return request(
			`/assets/${encodeURIComponent(assetId)}`,
			assetDeletionSchema,
			{ method: "DELETE", idempotencyKey },
		);
	},
	createProjectAsset(
		projectId: string,
		body: AssetCreateBody,
		idempotencyKey: string,
	) {
		return request(projectPath(projectId, "assets"), assetCreationSchema, {
			method: "POST",
			body,
			idempotencyKey,
		});
	},
	createAppointmentAsset(
		appointmentId: string,
		body: AssetCreateBody,
		idempotencyKey: string,
	) {
		return request(
			`/appointments/${encodeURIComponent(appointmentId)}/assets`,
			assetCreationSchema,
			{ method: "POST", body, idempotencyKey },
		);
	},
	putTransfer(
		transfer: NonNullable<AssetCreation["transfer"]>,
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
};
export type { AppointmentStatus, Asset };
