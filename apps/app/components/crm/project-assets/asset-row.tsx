"use client";

import Download from "@carbon/icons-react/es/Download";
import Edit from "@carbon/icons-react/es/Edit";
import OverflowMenuVertical from "@carbon/icons-react/es/OverflowMenuVertical";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenu as DropdownMenuPrimitive,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { formatBytes } from "@/lib/project-assets/date-time";
import type { Asset } from "@/lib/project-assets/schemas";

const STATUS_TONE = {
	READY: "success",
	UNVERIFIED: "warning",
	DELETING: "warning",
	DELETED: "neutral",
} as const;

export function AssetRow({
	asset,
	onDownload,
	onEdit,
	onDelete,
}: {
	asset: Asset;
	onDownload: () => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	return (
		<div className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
			<button
				type="button"
				onClick={asset.status === "READY" ? onDownload : undefined}
				disabled={asset.status !== "READY"}
				className="min-w-0 flex-1 text-left disabled:cursor-default"
			>
				<span className="block truncate font-medium text-sm">
					{asset.fileName}
				</span>
				<span className="block truncate text-muted-foreground text-xs">
					{asset.kind} · {formatBytes(asset.sizeBytes)}
				</span>
			</button>
			<StatusIndicator
				tone={STATUS_TONE[asset.status]}
				label={asset.status.toLowerCase()}
				size="sm"
			/>
			{asset.status === "READY" || asset.status === "UNVERIFIED" ? (
				<>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={asset.status === "READY" ? onDownload : undefined}
						disabled={asset.status !== "READY"}
						aria-label={`Download ${asset.fileName}`}
					>
						<Icon icon={Download} />
					</Button>
					<DropdownMenuPrimitive>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Actions for ${asset.fileName}`}
							>
								<Icon icon={OverflowMenuVertical} />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onSelect={onEdit}>
								<Icon icon={Edit} />
								Edit metadata
							</DropdownMenuItem>
							<DropdownMenuItem variant="destructive" onSelect={onDelete}>
								<Icon icon={TrashCan} />
								Delete file
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenuPrimitive>
				</>
			) : null}
		</div>
	);
}
