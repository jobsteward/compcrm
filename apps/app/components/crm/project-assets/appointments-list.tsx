"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import type { Dispatch, SetStateAction } from "react";
import type { AppointmentFilters } from "@/lib/project-assets/client";
import { formatAppointmentDate } from "@/lib/project-assets/date-time";
import type { Appointment } from "@/lib/project-assets/schemas";
import { AppointmentFilterControls } from "./appointment-filters";

export type UserOption = { id: string; name: string | null };

type AppointmentResult = {
	items: Appointment[];
	page: number;
	pageSize: number;
	total: number;
	hasNextPage: boolean;
};

const STATUS_TONE = {
	SCHEDULED: "info",
	COMPLETED: "success",
	CANCELED: "neutral",
} as const;

export function AppointmentsList({
	filters,
	setFilters,
	result,
	loading,
	error,
	users,
	onSelect,
	onCreate,
}: {
	filters: AppointmentFilters;
	setFilters: Dispatch<SetStateAction<AppointmentFilters>>;
	result?: AppointmentResult;
	loading: boolean;
	error?: string;
	users: UserOption[];
	onSelect: (id: string) => void;
	onCreate: () => void;
}) {
	const ownerName = new Map(
		users.map((user) => [user.id, user.name || user.id]),
	);
	return (
		<section className="space-y-3 border-b pb-4">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h2 className="font-medium text-sm">Appointments</h2>
					<p className="text-muted-foreground text-xs">
						Schedule and retain project meetings.
					</p>
				</div>
				<Button size="sm" onClick={onCreate}>
					<Add data-icon="inline-start" />
					New appointment
				</Button>
			</div>

			<AppointmentFilterControls
				filters={filters}
				setFilters={setFilters}
				users={users}
			/>

			{loading ? (
				<div className="flex justify-center py-6">
					<Spinner />
				</div>
			) : error ? (
				<p className="py-4 text-destructive text-xs">{error}</p>
			) : result?.items.length ? (
				<div className="divide-y rounded-lg border">
					{result.items.map((appointment) => (
						<button
							key={appointment.id}
							type="button"
							onClick={() => onSelect(appointment.id)}
							className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left hover:bg-muted/40"
						>
							<span className="min-w-0 space-y-1">
								<span className="block truncate font-medium text-sm">
									{appointment.title}
								</span>
								<span className="block truncate text-muted-foreground text-xs">
									{formatAppointmentDate(
										appointment.startsAt,
										appointment.timeZone,
									)}{" "}
									· {ownerName.get(appointment.ownerId) ?? appointment.ownerId}
								</span>
							</span>
							<StatusIndicator
								tone={STATUS_TONE[appointment.status]}
								label={appointment.status.toLowerCase()}
								size="sm"
							/>
						</button>
					))}
				</div>
			) : (
				<p className="rounded-lg border border-dashed p-5 text-center text-muted-foreground text-xs">
					No appointments match these filters.
				</p>
			)}

			{result ? (
				<div className="flex items-center justify-between text-muted-foreground text-xs">
					<span>
						{result.total} result{result.total === 1 ? "" : "s"}
					</span>
					<span className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={result.page <= 1}
							onClick={() =>
								setFilters((current) => ({
									...current,
									page: result.page - 1,
								}))
							}
						>
							Previous
						</Button>
						<span>Page {result.page}</span>
						<Button
							variant="outline"
							size="sm"
							disabled={!result.hasNextPage}
							onClick={() =>
								setFilters((current) => ({
									...current,
									page: result.page + 1,
								}))
							}
						>
							Next
						</Button>
					</span>
				</div>
			) : null}
		</section>
	);
}
