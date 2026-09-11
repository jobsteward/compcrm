"use client";

import type { Appointment, Asset } from "@/lib/project-assets/schemas";
import { AppointmentFormDialog } from "./appointment-form-dialog";
import type { UserOption } from "./appointments-list";
import { AssetEditorDialog } from "./asset-editor-dialog";
import { ConfirmationDialog } from "./confirmation-dialog";
import type { ConfirmTarget } from "./project-workspace-actions";
import { UploadDialog } from "./upload-dialog";

export function ProjectWorkspaceDialogs({
	projectId,
	users,
	defaultOwnerId,
	appointments,
	appointmentForm,
	onAppointmentFormOpenChange,
	onAppointmentSaved,
	upload,
	onUploadOpenChange,
	onAssetsChanged,
	assetEditorId,
	onAssetEditorOpenChange,
	onAssetSaved,
	confirm,
	pendingAction,
	confirmError,
	onConfirmOpenChange,
	onConfirm,
}: {
	projectId: string;
	users: UserOption[];
	defaultOwnerId: string;
	appointments: Appointment[];
	appointmentForm: { open: boolean; appointment: Appointment | null };
	onAppointmentFormOpenChange: (open: boolean) => void;
	onAppointmentSaved: (appointment: Appointment) => void;
	upload: { open: boolean; appointmentId: string | null };
	onUploadOpenChange: (open: boolean) => void;
	onAssetsChanged: () => void;
	assetEditorId: string | null;
	onAssetEditorOpenChange: (open: boolean) => void;
	onAssetSaved: (asset: Asset) => void;
	confirm: ConfirmTarget | null;
	pendingAction: boolean;
	confirmError?: string | null;
	onConfirmOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<>
			{appointmentForm.open ? (
				<AppointmentFormDialog
					key={appointmentForm.appointment?.id ?? "new"}
					projectId={projectId}
					open
					appointment={appointmentForm.appointment}
					users={users}
					defaultOwner={defaultOwnerId}
					onOpenChange={onAppointmentFormOpenChange}
					onSaved={onAppointmentSaved}
				/>
			) : null}
			<UploadDialog
				projectId={projectId}
				open={upload.open}
				appointmentId={upload.appointmentId}
				appointments={appointments}
				onOpenChange={onUploadOpenChange}
				onAssetsChanged={onAssetsChanged}
			/>
			{assetEditorId ? (
				<AssetEditorDialog
					key={assetEditorId}
					projectId={projectId}
					assetId={assetEditorId}
					open
					onOpenChange={onAssetEditorOpenChange}
					onSaved={onAssetSaved}
				/>
			) : null}
			<ConfirmationDialog
				open={Boolean(confirm)}
				title={`${confirm?.type === "delete" ? "Delete" : confirm?.type === "restore" ? "Restore" : "Archive"} ${confirm?.type === "delete" ? confirm.asset.fileName : (confirm?.appointment.title ?? "appointment")}?`}
				description={
					confirm?.type === "delete"
						? "The file leaves project lists and enters storage cleanup. This does not delete the appointment."
						: confirm?.type === "restore"
							? "The appointment returns to the active list. Its files and status stay unchanged."
							: "The appointment leaves the active list. Its files and collection references stay in the project."
				}
				action={
					confirm?.type === "delete"
						? "Delete file"
						: confirm?.type === "restore"
							? "Restore appointment"
							: "Archive appointment"
				}
				pending={pendingAction}
				error={confirmError}
				onOpenChange={onConfirmOpenChange}
				onConfirm={onConfirm}
			/>
		</>
	);
}
