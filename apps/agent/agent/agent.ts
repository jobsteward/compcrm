import "@crm/env/load";

import { defaultAgentModelResult } from "@crm/db/settings";
import { onTelemetryProblem, syncVersion } from "@crm/telemetry";
import { type DefinedAgent, defineAgent, defineDynamic } from "eve";
import { logCapabilities } from "./lib/capabilities";
import { selectedModel } from "./lib/model";

void logCapabilities();

onTelemetryProblem((message) => console.debug(`[telemetry] ${message}`));

void syncVersion();

const agent: DefinedAgent = defineAgent({
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
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 50_000,
		sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
	},
});

export default agent;
