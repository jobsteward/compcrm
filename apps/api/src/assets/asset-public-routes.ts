const assetPath =
	/^\/(?:assets(?:\/|$)|(?:projects|appointments)\/[^/]+\/assets(?:\/|$))/i;
const appointmentPath = /^\/projects\/[^/]+\/appointments(?:\/|$)/i;

export function isProjectResourcePath(path: string): boolean {
	return assetPath.test(path) || appointmentPath.test(path);
}
