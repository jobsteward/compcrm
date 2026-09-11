"use client";

import { DatePicker } from "@crm/ui/components/date-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import type { Dispatch, SetStateAction } from "react";
import type { AppointmentFilters } from "@/lib/project-assets/client";
import { dateBoundary } from "@/lib/project-assets/date-time";
import type { AppointmentStatus } from "@/lib/project-assets/schemas";
import type { UserOption } from "./appointments-list";

export function AppointmentFilterControls({
	filters,
	setFilters,
	users,
}: {
	filters: AppointmentFilters;
	setFilters: Dispatch<SetStateAction<AppointmentFilters>>;
	users: UserOption[];
}) {
	const patch = (next: Partial<AppointmentFilters>) =>
		setFilters((current) => ({ ...current, ...next, page: 1 }));
	const filterDate = (value: string | undefined, end = false) => {
		if (!value) return "";
		const date = new Date(value);
		if (end) date.setUTCDate(date.getUTCDate() - 1);
		return date.toISOString().slice(0, 10);
	};
	return (
		<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
			<Select
				value={filters.archived ? "archived" : "active"}
				onValueChange={(value) => patch({ archived: value === "archived" })}
			>
				<SelectTrigger aria-label="Appointment list">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="active">Active appointments</SelectItem>
					<SelectItem value="archived">Archived appointments</SelectItem>
				</SelectContent>
			</Select>
			<Select
				value={filters.status ?? "all"}
				onValueChange={(value) =>
					patch({
						status: value === "all" ? undefined : (value as AppointmentStatus),
					})
				}
			>
				<SelectTrigger aria-label="Appointment status">
					<SelectValue placeholder="All statuses" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All statuses</SelectItem>
					<SelectItem value="SCHEDULED">Scheduled</SelectItem>
					<SelectItem value="COMPLETED">Completed</SelectItem>
					<SelectItem value="CANCELED">Canceled</SelectItem>
				</SelectContent>
			</Select>
			<Select
				value={filters.ownerId ?? "all"}
				onValueChange={(value) =>
					patch({ ownerId: value === "all" ? undefined : value })
				}
			>
				<SelectTrigger aria-label="Appointment owner">
					<SelectValue placeholder="All owners" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All owners</SelectItem>
					{users.map((user) => (
						<SelectItem key={user.id} value={user.id}>
							{user.name || user.id}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<div className="flex gap-2">
				<DatePicker
					value={filterDate(filters.from)}
					onChange={(value) => patch({ from: dateBoundary(value) })}
					placeholder="From"
				/>
				<DatePicker
					value={filterDate(filters.to, true)}
					onChange={(value) => patch({ to: dateBoundary(value, true) })}
					placeholder="To"
				/>
			</div>
		</div>
	);
}
