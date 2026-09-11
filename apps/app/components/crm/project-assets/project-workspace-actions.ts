"use client";

import { useMutation } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useRef } from "react";
import { toast } from "sonner";
import { projectApi } from "@/lib/project-assets/client";
import { createOperationKeyStore } from "@/lib/project-assets/mutation-keys";
import type {
	Appointment,
	AppointmentStatus,
	Asset,
} from "@/lib/project-assets/schemas";

export type ConfirmTarget =
	| { type: "archive"; appointment: Appointment }
	| { type: "restore"; appointment: Appointment }
	| { type: "delete"; asset: Asset };

export function actionFingerprint(target: ConfirmTarget): string {
	if (target.type === "delete")
		return `asset:${target.asset.id}:delete:${target.asset.version}`;
	return `appointment:${target.appointment.id}:${target.type}:${target.appointment.version}`;
}

export function useProjectWorkspaceActions({
	projectId,
	invalidate,
	setSelectedAppointmentId,
	setConfirm,
}: {
	projectId: string;
	invalidate: () => void;
	setSelectedAppointmentId: Dispatch<SetStateAction<string | null>>;
	setConfirm: Dispatch<SetStateAction<ConfirmTarget | null>>;
}) {
	const actionKeys = useRef(createOperationKeyStore());
	const report = (error: Error) => toast.error(error.message);
	const status = useMutation<
		{ appointment: Appointment },
		Error,
		{ appointment: Appointment; next: AppointmentStatus }
	>({
		mutationFn: ({ appointment, next }) =>
			projectApi.updateAppointment(
				projectId,
				appointment.id,
				{ expectedVersion: appointment.version, status: next },
				actionKeys.current.for(
					`appointment:${appointment.id}:status:${next}:${appointment.version}`,
				),
			),
		onSuccess: (result, variables) => {
			actionKeys.current.clear(
				`appointment:${variables.appointment.id}:status:${variables.next}:${variables.appointment.version}`,
			);
			invalidate();
			setSelectedAppointmentId(result.appointment.id);
		},
		onError: report,
	});
	const archive = useMutation<
		unknown,
		Error,
		{ appointment: Appointment; restore: boolean }
	>({
		mutationFn: ({ appointment, restore }) =>
			restore
				? projectApi.updateAppointment(
						projectId,
						appointment.id,
						{ expectedVersion: appointment.version, archived: false },
						actionKeys.current.for(
							actionFingerprint({ type: "restore", appointment }),
						),
					)
				: projectApi.archiveAppointment(
						projectId,
						appointment.id,
						actionKeys.current.for(
							actionFingerprint({ type: "archive", appointment }),
						),
					),
		onSuccess: (_, variables) => {
			actionKeys.current.clear(
				actionFingerprint({
					type: variables.restore ? "restore" : "archive",
					appointment: variables.appointment,
				}),
			);
			invalidate();
			setConfirm(null);
		},
		onError: report,
	});
	const deleteAsset = useMutation<unknown, Error, Asset>({
		mutationFn: (asset) =>
			projectApi.deleteAsset(
				projectId,
				asset.id,
				actionKeys.current.for(actionFingerprint({ type: "delete", asset })),
			),
		onSuccess: (_, asset) => {
			actionKeys.current.clear(actionFingerprint({ type: "delete", asset }));
			invalidate();
			setConfirm(null);
		},
		onError: report,
	});
	return {
		status,
		archive,
		deleteAsset,
		discard: (target: ConfirmTarget) =>
			actionKeys.current.clear(actionFingerprint(target)),
		pendingAction:
			status.isPending || archive.isPending || deleteAsset.isPending,
	};
}
