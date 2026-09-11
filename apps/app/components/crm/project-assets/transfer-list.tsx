"use client";

import Close from "@carbon/icons-react/es/Close";
import Renew from "@carbon/icons-react/es/Renew";
import {
	Attachment,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentDescription,
	AttachmentGroup,
	AttachmentMedia,
	AttachmentTitle,
} from "@crm/ui/components/attachment";
import { Icon } from "@crm/ui/components/icon";
import type { UploadItem } from "./upload-session";

const LABELS = {
	QUEUED: "Queued",
	UPLOADING: "Uploading",
	FINALIZING: "Processing",
	READY: "Ready",
	FAILED: "Failed",
	CANCELED: "Canceled",
} as const;

export function TransferList({
	items,
	onRetry,
	onCancel,
}: {
	items: UploadItem[];
	onRetry: (item: UploadItem) => void;
	onCancel: (item: UploadItem) => void;
}) {
	if (!items.length) return null;
	return (
		<AttachmentGroup className="flex-col overflow-visible">
			{items.map((item) => {
				const state =
					item.status === "UPLOADING"
						? "uploading"
						: item.status === "FINALIZING"
							? "processing"
							: item.status === "FAILED"
								? "error"
								: "done";
				const canRetry = item.status === "FAILED";
				const canCancel = [
					"QUEUED",
					"UPLOADING",
					"FAILED",
					"CANCELED",
				].includes(item.status);
				return (
					<Attachment key={item.id} state={state} className="w-full">
						<AttachmentMedia>
							<span className="text-muted-foreground text-xs">
								{item.kind.slice(0, 3).toUpperCase()}
							</span>
						</AttachmentMedia>
						<AttachmentContent>
							<AttachmentTitle>{item.file.name}</AttachmentTitle>
							<AttachmentDescription>
								{LABELS[item.status]}
								{item.assetId
									? ` · ${item.assetId}`
									: item.error
										? ` · ${item.error}`
										: ""}
							</AttachmentDescription>
						</AttachmentContent>
						<AttachmentActions>
							{canRetry ? (
								<AttachmentAction
									onClick={() => onRetry(item)}
									aria-label={`Retry ${item.file.name}`}
								>
									<Icon icon={Renew} />
								</AttachmentAction>
							) : null}
							{canCancel ? (
								<AttachmentAction
									onClick={() => onCancel(item)}
									aria-label={`Cancel ${item.file.name}`}
								>
									<Icon icon={Close} />
								</AttachmentAction>
							) : null}
						</AttachmentActions>
					</Attachment>
				);
			})}
		</AttachmentGroup>
	);
}
