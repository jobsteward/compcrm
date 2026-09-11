import { assetRestMeta } from "../assets/asset-openapi";
import type { RestMethod } from "../trpc/openapi";

function appointmentRestMeta(method: RestMethod, path: `/${string}`) {
	const meta = assetRestMeta(method, path);
	if (meta.openapi) meta.openapi.tags = ["Appointments"];
	return meta;
}

export const appointmentRoutes = {
	createAppointment: appointmentRestMeta(
		"POST",
		"/projects/{projectId}/appointments",
	),
	listAppointments: appointmentRestMeta(
		"GET",
		"/projects/{projectId}/appointments",
	),
	getAppointment: appointmentRestMeta(
		"GET",
		"/projects/{projectId}/appointments/{appointmentId}",
	),
	updateAppointment: appointmentRestMeta(
		"PATCH",
		"/projects/{projectId}/appointments/{appointmentId}",
	),
	archiveAppointment: appointmentRestMeta(
		"DELETE",
		"/projects/{projectId}/appointments/{appointmentId}",
	),
};
