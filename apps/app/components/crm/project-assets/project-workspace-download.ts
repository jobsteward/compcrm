import { projectApi } from "@/lib/project-assets/client";
import type { Asset } from "@/lib/project-assets/schemas";

export async function downloadProjectAsset(projectId: string, asset: Asset) {
	const access = await projectApi.downloadAsset(projectId, asset.id);
	const link = document.createElement("a");
	link.href = access.url;
	link.download = access.fileName;
	link.target = "_blank";
	link.rel = "noreferrer";
	link.click();
}
