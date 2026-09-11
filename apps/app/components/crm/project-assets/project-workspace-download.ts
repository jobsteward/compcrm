import { projectApi } from "@/lib/project-assets/client";
import type { Asset } from "@/lib/project-assets/schemas";

export async function downloadProjectAsset(asset: Asset) {
	const result = await projectApi.getAsset(asset.id);
	if (!result.download)
		throw new Error(
			result.failure?.message ?? "The file is not available for download.",
		);
	const link = document.createElement("a");
	link.href = result.download.url;
	link.download = result.asset.fileName;
	link.target = "_blank";
	link.rel = "noreferrer";
	link.click();
}
