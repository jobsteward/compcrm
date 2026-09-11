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
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { projectApi } from "@/lib/project-assets/client";
import { assetQuery } from "@/lib/project-assets/queries";
import type { Asset } from "@/lib/project-assets/schemas";
import {
	operationKey,
	ProjectAssetsApiError,
} from "@/lib/project-assets/transport";
import { type AssetEditorDraft, AssetEditorView } from "./asset-editor-view";

function draftFor(asset: Asset): AssetEditorDraft {
	return {
		fileName: asset.fileName,
		kind: asset.kind,
	};
}

export function AssetEditorDialog({
	projectId,
	assetId,
	open,
	onOpenChange,
	onSaved,
}: {
	projectId: string;
	assetId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: (asset: Asset) => void;
}) {
	const query = useQuery(assetQuery(projectId, assetId));
	if (!open) return null;
	if (query.isPending)
		return (
			<Dialog open onOpenChange={onOpenChange}>
				<DialogContent>
					<Spinner />
				</DialogContent>
			</Dialog>
		);
	if (query.error || !query.data?.asset)
		return (
			<Dialog open onOpenChange={onOpenChange}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit file</DialogTitle>
						<DialogDescription>
							{query.error?.message ?? "Asset not found."}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	const asset = query.data.asset;
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit file metadata</DialogTitle>
					<DialogDescription>Change the file name or kind.</DialogDescription>
				</DialogHeader>
				<AssetEditorForm
					key={asset.id}
					projectId={projectId}
					asset={asset}
					onOpenChange={onOpenChange}
					onSaved={onSaved}
				/>
			</DialogContent>
		</Dialog>
	);
}

function AssetEditorForm({
	projectId,
	asset,
	onOpenChange,
	onSaved,
}: {
	projectId: string;
	asset: Asset;
	onOpenChange: (open: boolean) => void;
	onSaved: (asset: Asset) => void;
}) {
	const [draft, setDraft] = useState(() => draftFor(asset));
	const [error, setError] = useState<string | null>(null);
	const requestKey = useRef<string | null>(null);
	const draftVersion = useRef(asset.version);
	const latest = useQuery(assetQuery(projectId, asset.id));
	const save = useMutation({
		mutationFn: () => {
			const key = requestKey.current ?? operationKey();
			requestKey.current = key;
			return projectApi.updateAsset(
				asset.id,
				{
					expectedVersion: draftVersion.current,
					fileName: draft.fileName.trim(),
					kind: draft.kind.trim(),
				},
				key,
			);
		},
		onSuccess: (result) => {
			requestKey.current = null;
			onSaved(result.asset);
			onOpenChange(false);
		},
		onError: async (next) => {
			setError(next.message);
			if (
				next instanceof ProjectAssetsApiError &&
				next.code === "VERSION_CONFLICT"
			) {
				requestKey.current = null;
				const refreshed = await latest.refetch();
				const current = refreshed.data?.asset;
				if (current) {
					draftVersion.current = current.version;
					setDraft(draftFor(current));
					setError(
						"This file changed elsewhere. The latest values are loaded for review.",
					);
				}
			}
		},
	});
	const change = (next: Partial<AssetEditorDraft>) => {
		requestKey.current = null;
		setDraft((current) => ({ ...current, ...next }));
		setError(null);
	};
	return (
		<AssetEditorView
			draft={draft}
			error={error}
			latestVersion={latest.data?.asset?.version}
			editable={asset.status === "READY" || asset.status === "UNVERIFIED"}
			saving={save.isPending}
			onChange={change}
			onSubmit={() => save.mutate()}
			onCancel={() => onOpenChange(false)}
		/>
	);
}
