import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ASSETS } from "../src/assets/asset-config";
import { AssetStorageService } from "../src/assets/asset-storage.service";
import type { CapturedRequest } from "./asset-storage.fixture";
import { testClient, withR2Environment } from "./asset-storage.fixture";

let restore: (() => void) | undefined;

describe("AssetStorageService error behavior", () => {
	beforeEach(() => {
		restore = withR2Environment();
	});

	afterEach(() => {
		restore?.();
	});

	it("returns null when HEAD reports a missing object", async () => {
		const service = new AssetStorageService(
			undefined,
			testClient([], [], { statusCode: 404, headers: {} }),
		);

		expect(await service.head("assets", "temporary/missing")).toBeNull();
	});

	it("turns a changed source ETag into a state conflict", async () => {
		const service = new AssetStorageService(
			undefined,
			testClient([], [], {
				statusCode: 412,
				headers: {},
				body: new TextEncoder().encode("secret provider details"),
			}),
		);

		const promise = service.copy(
			"assets",
			"temporary/upload-1",
			"final/upload-1",
			'"old"',
		);
		await expect(promise).rejects.toMatchObject({
			status: 409,
			code: "SOURCE_ETAG_MISMATCH",
		});
		await expect(promise).rejects.not.toThrow("secret provider details");
	});

	it("redacts provider errors and keeps transient errors retryable", async () => {
		const service = new AssetStorageService(
			undefined,
			testClient(
				[],
				[],
				undefined,
				Object.assign(new Error("secret-key"), {
					$metadata: { httpStatusCode: 503 },
				}),
			),
		);

		const error = await service
			.delete("assets", "final/upload-1")
			.catch((value) => value);
		expect(error).toMatchObject({
			status: 503,
			code: "STORAGE_UNAVAILABLE",
			retryable: true,
		});
		expect(error.message).toBe("Object storage request failed.");
		expect(error.message).not.toContain("secret-key");
	});

	it("passes an aborted request signal and sanitizes the provider error", async () => {
		const requests: CapturedRequest[] = [];
		const controller = new AbortController();
		const service = new AssetStorageService(
			undefined,
			testClient(
				requests,
				[],
				undefined,
				Object.assign(new Error("secret provider details"), {
					name: "AbortError",
				}),
			),
		);

		controller.abort();
		const error = await service
			.delete("assets", "temporary/upload-1", controller.signal)
			.catch((value) => value);

		expect(requests[0]?.abortSignal).toBe(controller.signal);
		expect(error).toMatchObject({
			status: 503,
			code: "STORAGE_UNAVAILABLE",
			retryable: true,
		});
		expect(error.message).toBe("Object storage request failed.");
		expect(error.message).not.toContain("secret provider details");
	});

	it("rejects a PUT above the single-request R2 limit", async () => {
		const service = new AssetStorageService();

		await expect(
			service.presignPut(
				"assets",
				"temporary/upload-1",
				"application/octet-stream",
				ASSETS.maxSingleUploadBytes + 1,
				new Date(Date.now() + 60_000),
			),
		).rejects.toMatchObject({
			status: 413,
			code: "UPLOAD_TOO_LARGE",
			details: { maxBytes: 5363466240 },
		});
	});
});
