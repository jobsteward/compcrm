import { queryOptions } from "@tanstack/react-query";
import type { AppointmentFilters, AssetFilters } from "./client";
import { projectApi } from "./client";

const root = ["project-workspace"] as const;

export const projectKeys = {
	scope: (projectId: string) => [...root, projectId] as const,
	appointments: (projectId: string, filters: AppointmentFilters) =>
		[...projectKeys.scope(projectId), "appointments", filters] as const,
	appointment: (projectId: string, appointmentId: string) =>
		[...projectKeys.scope(projectId), "appointment", appointmentId] as const,
	assets: (projectId: string, filters: AssetFilters) =>
		[...projectKeys.scope(projectId), "assets", filters] as const,
	asset: (projectId: string, assetId: string) =>
		[...projectKeys.scope(projectId), "asset", assetId] as const,
};

export function appointmentsQuery(
	projectId: string,
	filters: AppointmentFilters,
) {
	return queryOptions({
		queryKey: projectKeys.appointments(projectId, filters),
		queryFn: () => projectApi.listAppointments(projectId, filters),
	});
}

export function appointmentQuery(
	projectId: string,
	appointmentId: string | null,
) {
	return queryOptions({
		queryKey: projectKeys.appointment(projectId, appointmentId ?? "none"),
		queryFn: () => projectApi.getAppointment(projectId, appointmentId ?? ""),
		enabled: Boolean(appointmentId),
	});
}

export function assetsQuery(projectId: string, filters: AssetFilters) {
	return queryOptions({
		queryKey: projectKeys.assets(projectId, filters),
		queryFn: () => projectApi.listAssets(projectId, filters),
	});
}

export function assetQuery(projectId: string, assetId: string | null) {
	return queryOptions({
		queryKey: projectKeys.asset(projectId, assetId ?? "none"),
		queryFn: () => projectApi.getAsset(projectId, assetId ?? ""),
		enabled: Boolean(assetId),
	});
}
