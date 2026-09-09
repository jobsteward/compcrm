import { z } from "zod";

const activeOrganizationClaim = z.string().trim().min(1);

export function parseActiveOrganizationClaim(value: unknown): string | null {
	const parsed = activeOrganizationClaim.safeParse(value);
	return parsed.success ? parsed.data : null;
}
