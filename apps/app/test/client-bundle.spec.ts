import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

it.each([
	"../app/(app)/[slug]/settings/research-key.tsx",
	"../app/(landing)/onboarding/onboarding-form.tsx",
])("bundles %s without Node.js dependencies", async (entrypoint) => {
	const result = await Bun.build({
		entrypoints: [fileURLToPath(new URL(entrypoint, import.meta.url))],
		target: "browser",
		plugins: [
			{
				name: "external-ui-dependencies",
				setup(build) {
					build.onResolve({ filter: /^[^./]/ }, ({ path }) => {
						if (path.startsWith("node:"))
							throw new Error(`Browser import: ${path}`);
						if (path.startsWith("@crm/db")) {
							return { path: fileURLToPath(import.meta.resolve(path)) };
						}
						return { path, external: true };
					});
				},
			},
		],
	});

	expect(result.logs).toEqual([]);
	expect(result.success).toBe(true);
});
