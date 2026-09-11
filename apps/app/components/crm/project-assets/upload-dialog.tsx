"use client";

import { useRef, useState } from "react";
import type { Appointment } from "@/lib/project-assets/schemas";
import { operationKey } from "@/lib/project-assets/transport";
import { TransferList } from "./transfer-list";
import { UploadForm } from "./upload-form";
import { UploadRunner } from "./upload-runner";
import type { UploadItem } from "./upload-session";

export function UploadDialog({
	projectId,
	open,
	activityId,
	appointments,
	onOpenChange,
	onAssetsChanged,
}: {
	projectId: string;
	open: boolean;
	activityId: string | null;
	appointments: Appointment[];
	onOpenChange: (open: boolean) => void;
	onAssetsChanged: () => void;
}) {
	const [items, setItems] = useState<UploadItem[]>([]);
	const runners = useRef(new Map<string, UploadRunner>());
	const submit = (
		files: File[],
		kind: string,
		selectedActivity: string | null,
	) => {
		const next = files.map<UploadItem>((file) => ({
			id: operationKey(),
			file,
			kind,
			activityId: selectedActivity,
			createKey: operationKey(),
			renewKey: operationKey(),
			confirmKey: operationKey(),
			cancelKey: operationKey(),
			uploadId: null,
			assetId: null,
			transfer: null,
			status: "QUEUED",
			error: null,
		}));
		setItems((current) => [...current, ...next]);
		onOpenChange(false);
		for (const item of next) {
			const runner = new UploadRunner(
				projectId,
				item,
				(updated) => {
					setItems((current) =>
						current.map((row) => (row.id === updated.id ? updated : row)),
					);
				},
				onAssetsChanged,
			);
			runners.current.set(item.id, runner);
			void runner.run();
		}
	};
	return (
		<>
			{open ? (
				<UploadForm
					key={activityId ?? "none"}
					activityId={activityId}
					appointments={appointments}
					onClose={() => onOpenChange(false)}
					onSubmit={submit}
				/>
			) : null}
			<TransferList
				items={items}
				onRetry={(item) => void runners.current.get(item.id)?.run()}
				onCancel={(item) => void runners.current.get(item.id)?.cancel()}
			/>
		</>
	);
}
