import { describe, expect, it } from "bun:test";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

function startup(errorCode: string, persistent = false) {
	const resource = "https://api.example.test";
	const memory = memoryAdapter({
		oauthResource: [],
		oauthClient: [],
		oauthClientResource: [],
	});
	let attempts = 0;
	const auth = betterAuth({
		baseURL: "https://auth.example.test",
		secret: "oauth-startup-test-secret-with-at-least-32-characters",
		database: (options) => {
			const adapter = memory(options);
			return {
				...adapter,
				findOne: async (input) => {
					if (input.model === "oauthResource") {
						attempts += 1;
						if (attempts === 1 || persistent) {
							throw Object.assign(new Error("Database unavailable"), {
								code: errorCode,
							});
						}
					}
					return adapter.findOne(input);
				},
			};
		},
		plugins: [
			oauthProvider({
				loginPage: "/sign-in",
				consentPage: "/consent",
				disableJwtPlugin: true,
				resources: [{ identifier: resource, name: "Test API" }],
				resourceSeedMode: "overwrite",
				clientRegistrationDefaultResources: [resource],
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
			}),
		],
	});
	const register = () =>
		auth.api.registerOAuthClient({
			body: {
				client_name: "Startup regression",
				redirect_uris: ["https://client.example.test/callback"],
				token_endpoint_auth_method: "none",
			},
		});
	return { auth, register, attempts: () => attempts };
}

describe("OAuth startup database recovery", () => {
	it("serves sessions and retries resource setup after a connection reset", async () => {
		const { auth, register, attempts } = startup("ECONNRESET");
		expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
		expect(await register()).toHaveProperty("client_id");
		expect(attempts()).toBeGreaterThan(1);
	});

	it("keeps resource requests blocked while the database remains unavailable", async () => {
		const { auth, register, attempts } = startup("ECONNRESET", true);
		await auth.$context;
		await expect(register()).rejects.toThrow("Database unavailable");
		await expect(register()).rejects.toThrow("Database unavailable");
		expect(attempts()).toBe(3);
	});

	it("preserves initialization failures for schema errors", async () => {
		const { auth } = startup("P2022");
		await expect(auth.$context).rejects.toThrow("Database unavailable");
	});
});
