import { describe, expect, mock, test } from "bun:test";
import { projectApi } from "../lib/project-assets/client";
import { uploadFixture } from "./project-assets-upload.fixture";

describe("project asset upload recovery", () => {
	test("replays lost creation with the same key before transfer", async () => {
		const f = uploadFixture();
		f.api.createProjectAsset.mockRejectedValueOnce(new Error("Response lost"));

		await f.runner.run();
		expect(f.changes.at(-1)?.status).toBe("FAILED");

		await f.runner.run();
		expect(f.api.createProjectAsset).toHaveBeenCalledTimes(2);
		expect(f.api.createProjectAsset.mock.calls.map((call) => call[2])).toEqual([
			"create",
			"create",
		]);
		expect(f.api.putTransfer).toHaveBeenCalledTimes(1);
		expect(f.api.updateAsset).toHaveBeenCalledTimes(1);
		expect(f.onReady).toHaveBeenCalledTimes(1);
		expect(f.changes.at(-1)?.status).toBe("READY");
	});

	test("replays lost completion without another creation or transfer", async () => {
		const f = uploadFixture();
		f.api.updateAsset.mockRejectedValueOnce(new Error("Response lost"));

		await f.runner.run();
		expect(f.changes.at(-1)?.status).toBe("FAILED");
		await f.runner.run();

		expect(f.api.createProjectAsset).toHaveBeenCalledTimes(1);
		expect(f.api.putTransfer).toHaveBeenCalledTimes(1);
		expect(f.api.updateAsset).toHaveBeenCalledTimes(2);
		expect(f.api.updateAsset.mock.calls.map((call) => call[2])).toEqual([
			"complete",
			"complete",
		]);
		expect(f.onReady).toHaveBeenCalledTimes(1);
		expect(f.changes.at(-1)?.status).toBe("READY");
	});

	test("cancels an accepted asset before transfer when creation was pending", async () => {
		const f = uploadFixture();
		const pending = Promise.withResolvers<typeof f.creation>();
		f.api.createProjectAsset.mockImplementationOnce(() => pending.promise);
		const run = f.runner.run();
		await Promise.resolve();
		await f.runner.cancel();
		pending.resolve(f.creation);
		await run;

		expect(f.api.deleteAsset).toHaveBeenCalledTimes(1);
		expect(f.api.putTransfer).not.toHaveBeenCalled();
		expect(f.api.updateAsset).not.toHaveBeenCalled();
		expect(f.onReady).toHaveBeenCalledTimes(1);
		expect(f.changes.at(-1)?.status).toBe("CANCELED");
	});

	test("cancels an asset when the direct transfer is aborted", async () => {
		const f = uploadFixture();
		const started = Promise.withResolvers<void>();
		f.api.putTransfer.mockImplementationOnce(
			(_transfer, _file, signal) =>
				new Promise((_resolve, reject) => {
					signal?.addEventListener(
						"abort",
						() => reject(new Error("Aborted")),
						{ once: true },
					);
					started.resolve();
				}),
		);
		const run = f.runner.run();
		await started.promise;
		await f.runner.cancel();
		await run;

		expect(f.api.deleteAsset).toHaveBeenCalledTimes(1);
		expect(f.api.updateAsset).not.toHaveBeenCalled();
		expect(f.onReady).toHaveBeenCalledTimes(1);
		expect(f.changes.at(-1)?.status).toBe("CANCELED");
	});

	test("refreshes the transfer by replaying the original creation on retry", async () => {
		const f = uploadFixture();
		if (!f.creation.transfer) throw new Error("Fixture requires a transfer");
		const refreshed = {
			...f.creation,
			transfer: {
				...f.creation.transfer,
				url: "https://storage.example/refreshed",
			},
		};
		f.api.createProjectAsset
			.mockResolvedValueOnce(f.creation)
			.mockResolvedValueOnce(refreshed);
		f.api.putTransfer.mockRejectedValueOnce(new Error("Transfer failed"));

		await f.runner.run();
		expect(f.changes.at(-1)?.status).toBe("FAILED");
		await f.runner.run();

		expect(f.api.createProjectAsset).toHaveBeenCalledTimes(2);
		expect(f.api.createProjectAsset.mock.calls.map((call) => call[2])).toEqual([
			"create",
			"create",
		]);
		expect(f.api.putTransfer.mock.calls.map((call) => call[0].url)).toEqual([
			"https://storage.example/file",
			"https://storage.example/refreshed",
		]);
		expect(f.api.updateAsset).toHaveBeenCalledTimes(1);
	});

	test("uses the appointment collection path without a body association", async () => {
		const f = uploadFixture("appointment");
		await f.runner.run();

		expect(f.api.createProjectAsset).not.toHaveBeenCalled();
		expect(f.api.createAppointmentAsset).toHaveBeenCalledTimes(1);
		expect(f.api.createAppointmentAsset.mock.calls[0]?.[1]).not.toHaveProperty(
			"appointmentId",
		);
	});

	test("sends the signed transfer without CRM credentials", async () => {
		const f = uploadFixture();
		if (!f.creation.transfer) throw new Error("Fixture requires a transfer");
		const originalFetch = globalThis.fetch;
		const fetchMock = mock(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(null, { status: 200 }),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		try {
			await projectApi.putTransfer(f.creation.transfer, f.item.file);
		} finally {
			globalThis.fetch = originalFetch;
		}

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe(f.creation.transfer.url);
		expect(init).toMatchObject({
			method: "PUT",
			credentials: "omit",
			headers: f.creation.transfer.headers,
			body: f.item.file,
		});
	});
});
