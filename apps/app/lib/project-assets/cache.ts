import type { QueryClient } from "@tanstack/react-query";
import type { CrmCache } from "@/lib/trpc/cache";
import { projectKeys } from "./queries";

export async function invalidateProjectWorkspace(
	queryClient: QueryClient,
	crmCache: Pick<CrmCache, "activity">,
	projectId: string,
) {
	await Promise.all([
		queryClient.invalidateQueries({ queryKey: projectKeys.scope(projectId) }),
		crmCache.activity(),
	]);
}
