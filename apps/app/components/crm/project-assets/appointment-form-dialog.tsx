"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { projectApi } from "@/lib/project-assets/client";
import {
	defaultTimeZone,
	isoToLocalInput,
	localInputToIso,
} from "@/lib/project-assets/date-time";
import { appointmentQuery } from "@/lib/project-assets/queries";
import type { Appointment } from "@/lib/project-assets/schemas";
import {
	operationKey,
	ProjectAssetsApiError,
} from "@/lib/project-assets/transport";
import {
	type AppointmentDraft,
	AppointmentFormView,
} from "./appointment-form-view";
import type { UserOption } from "./appointments-list";

type ScheduleSnapshot = {
	startsAt: string;
	endsAt: string | null;
	timeZone: string;
	startsLocal: string;
	endsLocal: string;
};

function initialDraft(
	appointment: Appointment | null,
	defaultOwner: string,
): AppointmentDraft {
	const zone = appointment?.timeZone ?? defaultTimeZone();
	const start =
		appointment?.startsAt ?? new Date(Date.now() + 3_600_000).toISOString();
	return {
		title: appointment?.title ?? "",
		notes: appointment?.notes ?? "",
		startsAt: isoToLocalInput(start, zone),
		endsAt: isoToLocalInput(appointment?.endsAt ?? null, zone),
		timeZone: zone,
		location: appointment?.location ?? "",
		ownerId: appointment?.ownerId ?? defaultOwner,
		status: appointment?.status ?? "SCHEDULED",
	};
}

function scheduleSnapshot(
	appointment: Appointment | null,
): ScheduleSnapshot | null {
	if (!appointment) return null;
	return {
		startsAt: appointment.startsAt,
		endsAt: appointment.endsAt,
		timeZone: appointment.timeZone,
		startsLocal: isoToLocalInput(appointment.startsAt, appointment.timeZone),
		endsLocal: isoToLocalInput(appointment.endsAt, appointment.timeZone),
	};
}

export function AppointmentFormDialog({
	projectId,
	open,
	appointment,
	users,
	defaultOwner,
	onOpenChange,
	onSaved,
}: {
	projectId: string;
	open: boolean;
	appointment: Appointment | null;
	users: UserOption[];
	defaultOwner: string;
	onOpenChange: (open: boolean) => void;
	onSaved: (appointment: Appointment) => void;
}) {
	const latest = useQuery(appointmentQuery(projectId, appointment?.id ?? null));
	const [draft, setDraft] = useState(() =>
		initialDraft(appointment, defaultOwner),
	);
	const [editingAppointment, setEditingAppointment] =
		useState<Appointment | null>(appointment);
	const [formError, setFormError] = useState<string | null>(null);
	const requestKey = useRef<string | null>(null);
	const schedule = useRef<ScheduleSnapshot | null>(
		scheduleSnapshot(appointment),
	);
	const save = useMutation({
		mutationFn: async () => {
			const key = requestKey.current ?? operationKey();
			requestKey.current = key;
			const currentSchedule = schedule.current;
			const sameScheduleZone = currentSchedule?.timeZone === draft.timeZone;
			const startsAt =
				sameScheduleZone && currentSchedule?.startsLocal === draft.startsAt
					? currentSchedule.startsAt
					: localInputToIso(draft.startsAt, draft.timeZone);
			const endsAt = draft.endsAt
				? sameScheduleZone && currentSchedule?.endsLocal === draft.endsAt
					? currentSchedule.endsAt
					: localInputToIso(draft.endsAt, draft.timeZone)
				: null;
			const body = {
				title: draft.title.trim(),
				notes: draft.notes.trim() || null,
				startsAt,
				endsAt,
				timeZone: draft.timeZone.trim(),
				location: draft.location.trim() || null,
				ownerId: draft.ownerId,
				status: draft.status,
			};
			return editingAppointment
				? projectApi.updateAppointment(
						projectId,
						editingAppointment.id,
						{ ...body, expectedVersion: editingAppointment.version },
						key,
					)
				: projectApi.createAppointment(projectId, body, key);
		},
		onSuccess: (result) => {
			requestKey.current = null;
			onSaved(result.appointment);
			onOpenChange(false);
		},
		onError: async (error) => {
			setFormError(error.message);
			if (
				error instanceof ProjectAssetsApiError &&
				error.code === "VERSION_CONFLICT"
			) {
				requestKey.current = null;
				const refreshed = await latest.refetch();
				const current = refreshed.data?.appointment;
				if (current) {
					setEditingAppointment(current);
					setDraft(initialDraft(current, defaultOwner));
					schedule.current = scheduleSnapshot(current);
					setFormError(
						"This appointment changed elsewhere. The latest values are loaded for review.",
					);
				}
			}
		},
	});

	const change = (next: Partial<AppointmentDraft>) => {
		requestKey.current = null;
		setDraft((current) => ({ ...current, ...next }));
		setFormError(null);
	};
	const fieldError =
		save.error instanceof ProjectAssetsApiError
			? save.error.details?.fields
			: undefined;
	if (!open) return null;
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{editingAppointment ? "Edit appointment" : "New appointment"}
					</DialogTitle>
					<DialogDescription>
						Keep schedule details and collection context with the project.
					</DialogDescription>
				</DialogHeader>
				<AppointmentFormView
					draft={draft}
					users={users}
					formError={formError}
					latestVersion={latest.data?.appointment?.version}
					fieldError={fieldError}
					saving={save.isPending}
					onChange={change}
					onSubmit={() => save.mutate()}
					onCancel={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}
