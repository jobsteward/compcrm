"use client";

import { Button } from "@crm/ui/components/button";
import { DialogFooter } from "@crm/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";

export type AssetEditorDraft = {
	fileName: string;
	kind: string;
};

export function AssetEditorView({
	draft,
	error,
	latestVersion,
	editable,
	saving,
	onChange,
	onSubmit,
	onCancel,
}: {
	draft: AssetEditorDraft;
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
