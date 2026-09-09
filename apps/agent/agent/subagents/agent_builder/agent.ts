import { defaultAgentModelResult } from "@crm/db/settings";
import { type DefinedAgent, defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import { selectedModel } from "../../lib/model";

const agent: DefinedAgent = defineAgent({
	description:
		"Turn one private CRM builder-chat request into a validated, reviewable team-agent version without deploying it.",
	model: defineDynamic({
		events: {
			"session.started": async () => {
				const selected = await selectedModel();
				return selected
					? {
							model: selected.model,
							modelContextWindowTokens: selected.modelContextWindowTokens,
						}
					: defaultAgentModelResult();
			},
		},
	}),
	outputSchema: z.object({
		status: z.literal("draft_ready"),
		summary: z.string().min(1).max(1000),
		agentId: z.string().min(1),
		versionId: z.string().min(1),
	}),
	limits: {
		maxInputTokensPerSession: 100_000,
		maxOutputTokensPerSession: 10_000,
		sessionTimeoutMs: 24 * 60 * 60 * 1000,
	},
});

export default agent;
