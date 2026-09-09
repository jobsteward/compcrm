import { z } from "zod";

const apiKeyPrincipalMetadata = z.object({
	createdByUserId: z.string().trim().min(1),
});

export type ApiKeyPrincipalMetadata = z.infer<typeof apiKeyPrincipalMetadata>;

export function parseApiKeyPrincipalMetadata(
	value: unknown,
): ApiKeyPrincipalMetadata {
	return apiKeyPrincipalMetadata.parse(value);
}
