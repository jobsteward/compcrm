const canonicalResourcePath =
	/^\/api\/(?:assets\/[^/]+|appointments\/[^/]+\/assets|projects\/[^/]+\/(?:assets|appointments))(?:\/|$)/;

export function apiProxyPath(pathname: string): string {
	return canonicalResourcePath.test(pathname)
		? pathname.replace(/^\/api/, "")
		: pathname;
}
