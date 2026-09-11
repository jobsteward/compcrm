"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useState } from "react";
import type { Appointment } from "@/lib/project-assets/schemas";

export function UploadForm({
	appointmentId,
	appointments,
	onClose,
	onSubmit,
}: {
	appointmentId: string | null;
	appointments: Appointment[];
	onClose: () => void;
	onSubmit: (files: File[], kind: string, appointmentId: string | null) => void;
}) {
	const [files, setFiles] = useState<File[]>([]);
	const [kind, setKind] = useState("document");
	const [selectedAppointment, setSelectedAppointment] = useState(
		appointmentId ?? "none",
	);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Upload project files</DialogTitle>
					<DialogDescription>
						Each file uploads independently. Keep this project open until all
						uploads finish.
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="project-files">Files</FieldLabel>
						<Input
							id="project-files"
							type="file"
							multiple
							onChange={(event) =>
								setFiles(Array.from(event.target.files ?? []))
							}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="project-file-kind">Kind</FieldLabel>
						<Select value={kind} onValueChange={setKind}>
							<SelectTrigger id="project-file-kind">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="meeting_recording">
										Meeting recording
									</SelectItem>
									<SelectItem value="photo">Photo</SelectItem>
									<SelectItem value="document">Document</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="project-file-appointment">
							Collection appointment
						</FieldLabel>
						<Select
							value={selectedAppointment}
							onValueChange={setSelectedAppointment}
						>
							<SelectTrigger id="project-file-appointment">
								<SelectValue placeholder="No appointment" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="none">No appointment</SelectItem>
									{appointments.map((appointment) => (
										<SelectItem key={appointment.id} value={appointment.id}>
											{appointment.title}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					{files.length ? (
						<p className="text-muted-foreground text-xs">
							{files.length} file{files.length === 1 ? "" : "s"} selected.
						</p>
					) : null}
				</FieldGroup>
				<DialogFooter>
					<Button
						disabled={!files.length}
						onClick={() =>
							onSubmit(
								files,
								kind,
								selectedAppointment === "none" ? null : selectedAppointment,
							)
						}
					>
						Start upload
					</Button>
					<Button type="button" variant="outline" onClick={onClose}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
