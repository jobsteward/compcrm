import { defaultAgentModelResult } from "@crm/db/settings";
import { scopedDb as db } from "@crm/db/tenant-scope";
import { type DefinedAgent, defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import {
	attribute,
	purposeOf,
	runInSessionTenant,
} from "../../lib/session-purpose";

const agent: DefinedAgent = defineAgent({
	description:
		"Execute one immutable deployed CRM agent version and persist its result and every side effect.",
	model: defineDynamic({
		events: {
			"session.started": async (_event, ctx) => {
				if (purposeOf(ctx) !== "team-agent") {
					return defaultAgentModelResult();
				}
				const runId = attribute(ctx, "runId");
				if (!runId) {
					return defaultAgentModelResult();
				}
				const run = await runInSessionTenant(ctx, () =>
					db.agentRun.findUnique({
						where: { id: runId },
						select: {
							version: {
								select: { modelId: true, modelContextWindowTokens: true },
							},
						},
					}),
				);
				return run
					? {
							model: run.version.modelId,
							modelContextWindowTokens: run.version.modelContextWindowTokens,
						}
					: defaultAgentModelResult();
			},
		},
	}),
	outputSchema: z.object({
		summary: z.string().min(1).max(1000),
		result: z.record(z.string(), z.unknown()).nullable(),
	}),
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 40_000,
		sessionTimeoutMs: 24 * 60 * 60 * 1000,
	},
});

export default agent;
