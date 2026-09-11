const assetPath =
	/^\/(?:projects|customers)\/[^/]+\/(?:assets|asset-uploads)(?:\/|$)/i;
const appointmentPath = /^\/projects\/[^/]+\/appointments(?:\/|$)/i;

export function isProjectResourcePath(path: string): boolean {
	return assetPath.test(path) || appointmentPath.test(path);
}
