import { operationKey } from "./transport";

export function createOperationKeyStore(
	createKey: () => string = operationKey,
) {
	const keys = new Map<string, string>();
	return {
		for(fingerprint: string) {
			const existing = keys.get(fingerprint);
			if (existing) return existing;
			const next = createKey();
			keys.set(fingerprint, next);
			return next;
		},
		clear(fingerprint: string) {
			keys.delete(fingerprint);
		},
	};
}
