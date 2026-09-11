"use client";

import { Button } from "@crm/ui/components/button";
import { DialogFooter } from "@crm/ui/components/dialog";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import type { Appointment } from "@/lib/project-assets/schemas";
import type { UserOption } from "./appointments-list";

export type AppointmentDraft = {
	title: string;
	notes: string;
	startsAt: string;
	endsAt: string;
	timeZone: string;
	location: string;
	ownerId: string;
	status: Appointment["status"];
};

type FieldError = { field: string; message: string };

export function AppointmentFormView({
	draft,
	users,
	formError,
	latestVersion,
	fieldError,
	saving,
	onChange,
	onSubmit,
	onCancel,
}: {
	draft: AppointmentDraft;
	users: UserOption[];
	formError: string | null;
	latestVersion?: number;
	fieldError?: FieldError[];
	saving: boolean;
	onChange: (next: Partial<AppointmentDraft>) => void;
	onSubmit: () => void;
	onCancel: () => void;
}) {
	return (
		<>
			<form
				id="appointment-form"
				onSubmit={(event) => {
					event.preventDefault();
					onSubmit();
				}}
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="appointment-title">Title</FieldLabel>
						<Input
							id="appointment-title"
							value={draft.title}
							onChange={(event) => onChange({ title: event.target.value })}
							required
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="appointment-start">Starts</FieldLabel>
						<Input
							id="appointment-start"
							type="datetime-local"
							value={draft.startsAt}
							onChange={(event) => onChange({ startsAt: event.target.value })}
							required
						/>
						<FieldDescription>
							Enter the local time for the selected IANA time zone.
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="appointment-end">Ends</FieldLabel>
						<Input
							id="appointment-end"
							type="datetime-local"
							value={draft.endsAt}
							onChange={(event) => onChange({ endsAt: event.target.value })}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="appointment-time-zone">Time zone</FieldLabel>
						<Input
							id="appointment-time-zone"
							value={draft.timeZone}
							onChange={(event) => onChange({ timeZone: event.target.value })}
							placeholder="America/Chicago"
							required
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="appointment-location">Location</FieldLabel>
						<Input
							id="appointment-location"
							value={draft.location}
							onChange={(event) => onChange({ location: event.target.value })}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="appointment-owner">Owner</FieldLabel>
						<Select
							value={draft.ownerId}
							onValueChange={(ownerId) => onChange({ ownerId })}
						>
							<SelectTrigger id="appointment-owner">
								<SelectValue placeholder="Choose an owner" />
							</SelectTrigger>
							<SelectContent>
								{users.map((user) => (
									<SelectItem key={user.id} value={user.id}>
										{user.name || user.id}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="appointment-status">Status</FieldLabel>
						<Select
							value={draft.status}
							onValueChange={(status) =>
								onChange({ status: status as Appointment["status"] })
							}
						>
							<SelectTrigger id="appointment-status">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="SCHEDULED">Scheduled</SelectItem>
								<SelectItem value="COMPLETED">Completed</SelectItem>
								<SelectItem value="CANCELED">Canceled</SelectItem>
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="appointment-notes">Notes</FieldLabel>
						<Textarea
							id="appointment-notes"
							value={draft.notes}
							onChange={(event) => onChange({ notes: event.target.value })}
							rows={4}
						/>
					</Field>
					{formError ? (
						<p className="text-destructive text-xs">
							{formError}
							{latestVersion ? ` Latest version is ${latestVersion}.` : ""}
						</p>
					) : null}
					{fieldError?.map((field) => (
						<p key={field.field} className="text-destructive text-xs">
							{field.field}: {field.message}
						</p>
					))}
				</FieldGroup>
			</form>
			<DialogFooter>
				<Button
					type="submit"
					form="appointment-form"
					disabled={saving || !draft.title.trim() || !draft.ownerId}
				>
					{saving ? <Spinner /> : null}Save appointment
				</Button>
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
			</DialogFooter>
		</>
	);
}
