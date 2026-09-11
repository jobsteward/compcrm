"use client";

import { Button } from "@crm/ui/components/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { invalidateProjectWorkspace } from "@/lib/project-assets/cache";
import type {
	AppointmentFilters,
	AssetFilters,
} from "@/lib/project-assets/client";
import { appointmentsQuery, assetsQuery } from "@/lib/project-assets/queries";
import type { Appointment, Asset } from "@/lib/project-assets/schemas";
import { ProjectAssetsApiError } from "@/lib/project-assets/transport";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { AppointmentDetail } from "./appointment-detail";
import { AppointmentsList, type UserOption } from "./appointments-list";
import { AssetsList } from "./assets-list";
import {
	type ConfirmTarget,
	useProjectWorkspaceActions,
} from "./project-workspace-actions";
import { ProjectWorkspaceDialogs } from "./project-workspace-dialogs";
import { downloadProjectAsset } from "./project-workspace-download";

export function ProjectWorkspace({
	projectId,
	defaultOwnerId,
}: {
	projectId: string;
	defaultOwnerId?: string;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const crmCache = useCrmCache();
	const usersQuery = useQuery(trpc.users.list.queryOptions());
	const users: UserOption[] = (usersQuery.data ?? []).map((user) => ({
		id: user.id,
		name: user.name,
	}));
	const [appointmentFilters, setAppointmentFilters] =
		useState<AppointmentFilters>({ page: 1, pageSize: 25, archived: false });
	const [assetFilters, setAssetFilters] = useState<AssetFilters>({
		page: 1,
		pageSize: 25,
	});
	const appointments = useQuery(
		appointmentsQuery(projectId, appointmentFilters),
	);
	const assets = useQuery(assetsQuery(projectId, assetFilters));
	const [selectedAppointmentId, setSelectedAppointmentId] = useState<
		string | null
	>(null);
	const [appointmentForm, setAppointmentForm] = useState<{
		open: boolean;
		appointment: Appointment | null;
	}>({ open: false, appointment: null });
	const [upload, setUpload] = useState<{
		open: boolean;
		activityId: string | null;
	}>({ open: false, activityId: null });
	const [assetEditorId, setAssetEditorId] = useState<string | null>(null);
	const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
	const invalidate = () =>
		void invalidateProjectWorkspace(queryClient, crmCache, projectId);
	const actions = useProjectWorkspaceActions({
		projectId,
		invalidate,
		setSelectedAppointmentId,
		setConfirm,
	});
	const download = async (asset: Asset) => {
		try {
			await downloadProjectAsset(projectId, asset);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "The operation failed.",
			);
		}
	};
	const appointmentsItems = appointments.data?.items ?? [];
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
			<div className="space-y-4">
				{selectedAppointmentId ? (
					<AppointmentDetail
						projectId={projectId}
						appointmentId={selectedAppointmentId}
						onBack={() => setSelectedAppointmentId(null)}
						onEdit={(appointment) =>
							setAppointmentForm({ open: true, appointment })
						}
						onUpload={(appointment) =>
							setUpload({ open: true, activityId: appointment.id })
						}
						onArchive={(appointment) =>
							setConfirm({ type: "archive", appointment })
						}
						onRestore={(appointment) =>
							setConfirm({ type: "restore", appointment })
						}
						onStatusChange={(appointment, next) =>
							actions.status.mutate({ appointment, next })
						}
						actionPending={actions.pendingAction}
					/>
				) : null}
				<AppointmentsList
					filters={appointmentFilters}
					setFilters={setAppointmentFilters}
					result={appointments.data}
					loading={appointments.isPending}
					error={appointments.error?.message}
					users={users}
					onSelect={setSelectedAppointmentId}
					onCreate={() => setAppointmentForm({ open: true, appointment: null })}
				/>
				<AssetsList
					filters={assetFilters}
					setFilters={setAssetFilters}
					result={assets.data}
					loading={assets.isPending}
					error={assets.error?.message}
					appointments={appointmentsItems}
					onUpload={() =>
						setUpload({ open: true, activityId: selectedAppointmentId })
					}
					onDownload={download}
					onEdit={(asset) => setAssetEditorId(asset.id)}
					onDelete={(asset) => setConfirm({ type: "delete", asset })}
				/>
			</div>
			<ProjectWorkspaceDialogs
				projectId={projectId}
				users={users}
				defaultOwnerId={defaultOwnerId ?? users[0]?.id ?? ""}
				appointments={appointmentsItems}
				appointmentForm={appointmentForm}
				onAppointmentFormOpenChange={(open) =>
					setAppointmentForm((current) => ({ ...current, open }))
				}
				onAppointmentSaved={(appointment) => {
					invalidate();
					setSelectedAppointmentId(appointment.id);
				}}
				upload={upload}
				onUploadOpenChange={(open) =>
					setUpload((current) => ({ ...current, open }))
				}
				onAssetsChanged={invalidate}
				assetEditorId={assetEditorId}
				onAssetEditorOpenChange={(open) => {
					if (!open) setAssetEditorId(null);
				}}
				onAssetSaved={() => {
					invalidate();
					setAssetEditorId(null);
				}}
				confirm={confirm}
				pendingAction={actions.pendingAction}
				confirmError={
					actions.archive.error?.message ?? actions.deleteAsset.error?.message
				}
				onConfirmOpenChange={(open) => {
					if (!open && !actions.pendingAction) {
						if (confirm) actions.discard(confirm);
						setConfirm(null);
					}
				}}
				onConfirm={() => {
					if (!confirm) return;
					if (confirm.type === "delete")
						actions.deleteAsset.mutate(confirm.asset);
					else
						actions.archive.mutate({
							appointment: confirm.appointment,
							restore: confirm.type === "restore",
						});
				}}
			/>
			{usersQuery.error ? (
				<p className="mt-3 text-muted-foreground text-xs">
					Owner choices could not be loaded. The project owner remains
					available.
				</p>
			) : null}
			{actions.status.error instanceof ProjectAssetsApiError &&
			actions.status.error.code === "VERSION_CONFLICT" ? (
				<Button variant="outline" size="sm" onClick={invalidate}>
					Refresh appointment data
				</Button>
			) : null}
		</div>
	);
}
