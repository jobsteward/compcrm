import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { AssetError } from "../src/assets/asset-error";
import { AssetStorageService } from "../src/assets/asset-storage.service";
import type { CapturedRequest, ResponseSpec } from "./asset-storage.fixture";
import { r2Keys, testClient, withR2Environment } from "./asset-storage.fixture";

let restore: (() => void) | undefined;

describe("AssetStorageService request and signing behavior", () => {
	beforeEach(() => {
		restore = withR2Environment();
	});

	afterEach(() => {
		restore?.();
	});

	it("starts without R2 and reports a sanitized unavailable error", () => {
		for (const key of r2Keys) delete process.env[key];
		const service = new AssetStorageService();

		expect(service.configured()).toBe(false);
		expect(() => service.bucket()).toThrow(AssetError);
		try {
			service.bucket();
		} catch (error) {
			expect(error).toMatchObject({
				status: 503,
				code: "STORAGE_UNAVAILABLE",
				retryable: false,
			});
			expect((error as Error).message).not.toContain("secret-key");
		}
	});

	it("signs PUT content type and content length without an R2 checksum", async () => {
		const service = new AssetStorageService();
		const url = await service.presignPut(
			"assets",
			"temporary/upload-1",
			"audio/mpeg",
			1234,
			new Date(Date.now() + 60_000),
		);
		const parsed = new URL(url);

		expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toContain(
			"content-length",
		);
		expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toContain(
			"content-type",
		);
		expect(url).not.toContain("checksum");
	});

	it("signs private GET attachment disposition and response type", async () => {
		const service = new AssetStorageService();
		const url = await service.presignGet(
			"assets",
			"final/upload-1",
			"réunion 1.mp3",
			"audio/mpeg",
			new Date(Date.now() + 60_000),
		);
		const parsed = new URL(url);

		expect(parsed.searchParams.get("response-content-type")).toBe("audio/mpeg");
		expect(parsed.searchParams.get("response-content-disposition")).toContain(
			"attachment",
		);
		expect(parsed.searchParams.get("response-content-disposition")).toContain(
			"filename*=UTF-8''r%C3%A9union%201.mp3",
		);
	});

	it("intercepts HEAD, conditional COPY, and DELETE requests", async () => {
		const requests: CapturedRequest[] = [];
		const responses: ResponseSpec[] = [
			{
				statusCode: 200,
				headers: {
					"content-length": "42",
					etag: '"source-etag"',
					"content-type": "audio/mpeg",
				},
			},
			{
				statusCode: 200,
				body: new TextEncoder().encode("<CopyObjectResult/>"),
			},
			{ statusCode: 204 },
		];
		const service = new AssetStorageService(
			undefined,
			testClient(requests, responses),
		);

		expect(await service.head("assets", "temporary/upload-1")).toEqual({
			sizeBytes: 42,
			etag: '"source-etag"',
			contentType: "audio/mpeg",
		});
		await service.copy(
			"assets",
			"temporary/upload-1",
			"final/upload-1",
			'"source-etag"',
		);
		await service.delete("assets", "temporary/upload-1");

		expect(requests).toHaveLength(3);
		expect(requests[0]?.method).toBe("HEAD");
		expect(requests[1]?.method).toBe("PUT");
		expect(requests[1]?.headers["x-amz-copy-source"]).toContain(
			"assets/temporary/upload-1",
		);
		expect(requests[1]?.headers["x-amz-copy-source-if-match"]).toBe(
			'"source-etag"',
		);
		expect(requests[2]?.method).toBe("DELETE");
	});
});
