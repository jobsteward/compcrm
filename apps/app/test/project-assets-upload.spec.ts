import { describe, expect, test } from "bun:test";
import { uploadFixture } from "./project-assets-upload.fixture";

describe("project upload recovery", () => {
	test("cancels an accepted upload before transfer when creation was pending", async () => {
		const f = uploadFixture();
		const pending = Promise.withResolvers<typeof f.grant>();
		f.api.createUpload.mockImplementationOnce(() => pending.promise);
		const run = f.runner.run();
		await f.runner.cancel();
		pending.resolve(f.grant);
		await run;
		expect(f.api.cancelUpload).toHaveBeenCalledTimes(1);
		expect(f.api.putTransfer).not.toHaveBeenCalled();
		expect(f.api.confirmUpload).not.toHaveBeenCalled();
		expect(f.changes.at(-1)?.status).toBe("CANCELED");
	});

	test("replays unknown creation with the same key before canceling", async () => {
		const f = uploadFixture();
		const pending = Promise.withResolvers<typeof f.grant>();
		f.api.createUpload.mockImplementationOnce(() => pending.promise);
		const run = f.runner.run();
		await f.runner.cancel();
		pending.reject(new Error("Response lost"));
		await run;
		await f.runner.run();
		expect(
			f.api.createUpload.mock.calls.map((call) => Reflect.get(call, "2")),
		).toEqual(["create", "create"]);
		expect(f.api.putTransfer).not.toHaveBeenCalled();
		expect(f.changes.at(-1)?.status).toBe("CANCELED");
	});

	test("rotates renewal keys after a replay returns an expired grant", async () => {
		const f = uploadFixture();
		if (!f.grant.transfer) throw new Error("Fixture requires a transfer");
		const expired = {
			...f.grant,
			transfer: { ...f.grant.transfer, expiresAt: "2000-01-01T00:00:00Z" },
		};
		f.api.createUpload.mockResolvedValueOnce(expired);
		f.api.renewUpload.mockResolvedValueOnce(expired);
		await f.runner.run();
		const keys = f.api.renewUpload.mock.calls.map((call) =>
			Reflect.get(call, "2"),
		);
		expect(keys).toHaveLength(2);
		expect(keys[0]).toBe("renew");
		expect(keys[1]).not.toBe(keys[0]);
		expect(f.changes.at(-1)?.status).toBe("READY");
	});

	test("retries failed renewal with its original key and never creates a second upload", async () => {
		const f = uploadFixture();
		f.api.createUpload.mockResolvedValueOnce({ ...f.grant, transfer: null });
		f.api.renewUpload.mockRejectedValueOnce(new Error("Response lost"));
		await f.runner.run();
		await f.runner.run();
		expect(f.api.createUpload).toHaveBeenCalledTimes(1);
		expect(
			f.api.renewUpload.mock.calls.map((call) => Reflect.get(call, "2")),
		).toEqual(["renew", "renew"]);
		expect(f.changes.at(-1)?.status).toBe("READY");
	});

	test("reconciles a lost confirmation without another transfer", async () => {
		const f = uploadFixture();
		f.api.confirmUpload.mockRejectedValueOnce(new Error("Response lost"));
		await f.runner.run();
		f.api.getUpload.mockResolvedValueOnce({
			upload: { ...f.grant.upload, status: "FINALIZING" },
			pollAfterSeconds: 1,
		});
		await f.runner.run();
		expect(f.api.putTransfer).toHaveBeenCalledTimes(1);
		expect(f.api.confirmUpload).toHaveBeenCalledTimes(1);
		expect(f.ready).toHaveBeenCalledTimes(1);
	});

	test("does not confirm a transfer canceled while PUT was pending", async () => {
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
		expect(f.api.cancelUpload).toHaveBeenCalledTimes(1);
		expect(f.api.confirmUpload).not.toHaveBeenCalled();
		expect(f.changes.at(-1)?.status).toBe("CANCELED");
	});
});
