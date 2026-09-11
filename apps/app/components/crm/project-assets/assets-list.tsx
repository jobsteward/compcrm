"use client";

import Upload from "@carbon/icons-react/es/Upload";
import { Button } from "@crm/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import type { Dispatch, SetStateAction } from "react";
import type { AssetFilters } from "@/lib/project-assets/client";
import type { Appointment, Asset } from "@/lib/project-assets/schemas";
import { AssetRow } from "./asset-row";

type AssetResult = {
	items: Asset[];
	page: number;
	total: number;
	hasNextPage: boolean;
};

export function AssetsList({
	filters,
	setFilters,
	result,
	loading,
	error,
	appointments,
	onUpload,
	onDownload,
	onEdit,
	onDelete,
}: {
	filters: AssetFilters;
	setFilters: Dispatch<SetStateAction<AssetFilters>>;
	result?: AssetResult;
	loading: boolean;
	error?: string;
	appointments: Appointment[];
	onUpload: () => void;
	onDownload: (asset: Asset) => void;
	onEdit: (asset: Asset) => void;
	onDelete: (asset: Asset) => void;
}) {
	const patch = (next: Partial<AssetFilters>) =>
		setFilters((current) => ({ ...current, ...next, page: next.page ?? 1 }));

	return (
		<section className="space-y-3 pt-4">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h2 className="font-medium text-sm">Project files</h2>
					<p className="text-muted-foreground text-xs">
						Recordings, photos, and documents collected for this project.
					</p>
				</div>
				<Button size="sm" onClick={onUpload}>
					<Upload data-icon="inline-start" />
					Upload files
				</Button>
			</div>
			<div className="grid gap-2 sm:grid-cols-3">
				<Select
					value={filters.appointmentId ?? "all"}
					onValueChange={(value) =>
						patch({ appointmentId: value === "all" ? undefined : value })
					}
				>
					<SelectTrigger aria-label="File appointment">
						<SelectValue placeholder="All appointments" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All appointments</SelectItem>
						{appointments.map((appointment) => (
							<SelectItem key={appointment.id} value={appointment.id}>
								{appointment.title}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={filters.kind ?? "all"}
					onValueChange={(value) =>
						patch({ kind: value === "all" ? undefined : value })
					}
				>
					<SelectTrigger aria-label="File type">
						<SelectValue placeholder="All file types" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All file types</SelectItem>
						<SelectItem value="meeting_recording">Recordings</SelectItem>
						<SelectItem value="photo">Photos</SelectItem>
						<SelectItem value="document">Documents</SelectItem>
					</SelectContent>
				</Select>
				<Select
					value={filters.source ?? "all"}
					onValueChange={(value) =>
						patch({
							source:
								value === "all" ? undefined : (value as AssetFilters["source"]),
						})
					}
				>
					<SelectTrigger aria-label="File source">
						<SelectValue placeholder="All sources" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All sources</SelectItem>
						<SelectItem value="MANUAL">Manual</SelectItem>
						<SelectItem value="MOBILE_RECORDING">Mobile recording</SelectItem>
						<SelectItem value="EMAIL_ATTACHMENT">Email attachment</SelectItem>
					</SelectContent>
				</Select>
			</div>
			{loading ? (
				<div className="flex justify-center py-6">
					<Spinner />
				</div>
			) : error ? (
				<p className="py-4 text-destructive text-xs">{error}</p>
			) : result?.items.length ? (
				<div className="rounded-lg border">
					{result.items.map((asset) => (
						<AssetRow
							key={asset.id}
							asset={asset}
							onDownload={() => onDownload(asset)}
							onEdit={() => onEdit(asset)}
							onDelete={() => onDelete(asset)}
						/>
					))}
				</div>
			) : (
				<p className="rounded-lg border border-dashed p-5 text-center text-muted-foreground text-xs">
					No project files match these filters.
				</p>
			)}
			{result ? (
				<div className="flex items-center justify-between text-muted-foreground text-xs">
					<span>
						{result.total} file{result.total === 1 ? "" : "s"}
					</span>
					<span className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={result.page <= 1}
							onClick={() => patch({ page: result.page - 1 })}
						>
							Previous
						</Button>
						<span>Page {result.page}</span>
						<Button
							variant="outline"
							size="sm"
							disabled={!result.hasNextPage}
							onClick={() => patch({ page: result.page + 1 })}
						>
							Next
						</Button>
					</span>
				</div>
			) : null}
		</section>
	);
}
