import { z } from "zod";

export const assetTransferSchema = z.object({
	method: z.literal("PUT"),
	url: z.url(),
	headers: z.object({
		"Content-Type": z.string(),
		"Content-Length": z.string(),
	}),
	expiresAt: z.iso.datetime(),
	maxBytes: z.number().int(),
});
