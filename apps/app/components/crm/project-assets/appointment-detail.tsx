"use client";

import Archive from "@carbon/icons-react/es/Archive";
import Edit from "@carbon/icons-react/es/Edit";
import Undo from "@carbon/icons-react/es/Undo";
import Upload from "@carbon/icons-react/es/Upload";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useQuery } from "@tanstack/react-query";
import { formatAppointmentDate } from "@/lib/project-assets/date-time";
import { appointmentQuery } from "@/lib/project-assets/queries";
import type {
	Appointment,
	AppointmentStatus,
} from "@/lib/project-assets/schemas";

const STATUS_TONE = {
	SCHEDULED: "info",
	COMPLETED: "success",
	CANCELED: "neutral",
} as const;

export function AppointmentDetail({
	projectId,
	appointmentId,
	onBack,
	onEdit,
	onUpload,
	onArchive,
	onRestore,
	onStatusChange,
	actionPending,
}: {
	projectId: string;
	appointmentId: string;
	onBack: () => void;
	onEdit: (appointment: Appointment) => void;
	onUpload: (appointment: Appointment) => void;
	onArchive: (appointment: Appointment) => void;
	onRestore: (appointment: Appointment) => void;
	onStatusChange: (appointment: Appointment, status: AppointmentStatus) => void;
	actionPending: boolean;
}) {
	const query = useQuery(appointmentQuery(projectId, appointmentId));
	const appointment = query.data?.appointment;
	if (query.isPending)
		return (
			<div className="flex justify-center py-8">
				<Spinner />
			</div>
		);
	if (query.error || !appointment)
		return (
			<div className="space-y-3 p-4">
				<Button variant="outline" size="sm" onClick={onBack}>
					Back
				</Button>
				<p className="text-destructive text-xs">
					{query.error?.message ?? "Appointment not found."}
				</p>
			</div>
		);

	return (
		<div className="space-y-4 rounded-lg border bg-card p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<Button
						variant="ghost"
						size="sm"
						onClick={onBack}
						className="-ml-2 mb-2"
					>
						Back
					</Button>
					<h3 className="truncate font-medium text-base">
						{appointment.title}
					</h3>
					<p className="mt-1 text-muted-foreground text-xs">
						{formatAppointmentDate(appointment.startsAt, appointment.timeZone)}{" "}
						· {appointment.timeZone}
					</p>
				</div>
				<StatusIndicator
					tone={STATUS_TONE[appointment.status]}
					label={appointment.status.toLowerCase()}
				/>
			</div>
			<div className="grid gap-3 text-xs sm:grid-cols-2">
				<Detail label="Location" value={appointment.location} />
				<Detail label="Owner" value={appointment.ownerId} />
				<Detail
					label="Ends"
					value={
						appointment.endsAt
							? formatAppointmentDate(appointment.endsAt, appointment.timeZone)
							: "No end time"
					}
				/>
				<Detail label="Version" value={String(appointment.version)} />
				<Detail label="Notes" value={appointment.notes} wide />
			</div>
			<div className="flex flex-wrap gap-2 border-t pt-3">
				<Button
					variant="outline"
					size="sm"
					onClick={() => onEdit(appointment)}
					disabled={actionPending || Boolean(appointment.archivedAt)}
				>
					<Icon icon={Edit} data-icon="inline-start" />
					Edit
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => onUpload(appointment)}
					disabled={actionPending || Boolean(appointment.archivedAt)}
				>
					<Icon icon={Upload} data-icon="inline-start" />
					Upload files
				</Button>
				{appointment.archivedAt ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() => onRestore(appointment)}
						disabled={actionPending}
					>
						<Icon icon={Undo} data-icon="inline-start" />
						Restore
					</Button>
				) : (
					<Button
						variant="outline"
						size="sm"
						onClick={() => onArchive(appointment)}
						disabled={actionPending}
					>
						<Icon icon={Archive} data-icon="inline-start" />
						Archive
					</Button>
				)}
				{!appointment.archivedAt && appointment.status === "SCHEDULED" ? (
					<>
						<Button
							size="sm"
							onClick={() => onStatusChange(appointment, "COMPLETED")}
							disabled={actionPending}
						>
							Complete
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => onStatusChange(appointment, "CANCELED")}
							disabled={actionPending}
						>
							Cancel meeting
						</Button>
					</>
				) : null}
				{!appointment.archivedAt && appointment.status !== "SCHEDULED" ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() => onStatusChange(appointment, "SCHEDULED")}
						disabled={actionPending}
					>
						Reopen
					</Button>
				) : null}
			</div>
		</div>
	);
}

function Detail({
	label,
	value,
	wide = false,
}: {
	label: string;
	value: string | null;
	wide?: boolean;
}) {
	return (
		<div className={wide ? "sm:col-span-2" : ""}>
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="mt-1 whitespace-pre-wrap text-foreground">
				{value || "Not set"}
			</dd>
		</div>
	);
}
