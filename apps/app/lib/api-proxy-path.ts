const canonicalResourcePath =
	/^\/api\/(?:projects\/[^/]+\/(?:assets|asset-uploads|appointments)|customers\/[^/]+\/assets)(?:\/|$)/;

export function apiProxyPath(pathname: string): string {
	return canonicalResourcePath.test(pathname)
		? pathname.replace(/^\/api/, "")
		: pathname;
}
