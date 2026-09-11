"use client";

import { Button } from "@crm/ui/components/button";
import { DialogFooter } from "@crm/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import type { Appointment } from "@/lib/project-assets/schemas";

export type AssetEditorDraft = {
	fileName: string;
	kind: string;
	activityId: string;
};

export function AssetEditorView({
	draft,
	appointments,
	error,
	latestVersion,
	editable,
	saving,
	onChange,
	onSubmit,
	onCancel,
}: {
	draft: AssetEditorDraft;
	appointments: Appointment[];
	error: string | null;
	latestVersion?: number;
	editable: boolean;
	saving: boolean;
	onChange: (next: Partial<AssetEditorDraft>) => void;
	onSubmit: () => void;
	onCancel: () => void;
}) {
	return (
		<>
			<form
				id="asset-editor"
				onSubmit={(event) => {
					event.preventDefault();
					onSubmit();
				}}
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="asset-file-name">File name</FieldLabel>
						<Input
							id="asset-file-name"
							value={draft.fileName}
							onChange={(event) => onChange({ fileName: event.target.value })}
							disabled={!editable}
							required
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="asset-kind">Kind</FieldLabel>
						<Input
							id="asset-kind"
							value={draft.kind}
							onChange={(event) => onChange({ kind: event.target.value })}
							disabled={!editable}
							required
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="asset-appointment">
							Collection appointment
						</FieldLabel>
						<Select
							value={draft.activityId}
							onValueChange={(activityId) => onChange({ activityId })}
							disabled={!editable}
						>
							<SelectTrigger id="asset-appointment">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">No appointment</SelectItem>
								{appointments.map((appointment) => (
									<SelectItem key={appointment.id} value={appointment.id}>
										{appointment.title}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					{error ? (
						<p className="text-destructive text-xs">
							{error}
							{latestVersion ? ` Latest version is ${latestVersion}.` : ""}
						</p>
					) : null}
				</FieldGroup>
			</form>
			<DialogFooter>
				<Button
					type="submit"
					form="asset-editor"
					disabled={
						!editable || saving || !draft.fileName.trim() || !draft.kind.trim()
					}
				>
					{saving ? <Spinner /> : null}Save changes
				</Button>
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
			</DialogFooter>
		</>
	);
}
