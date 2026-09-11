import { describe, expect, mock, test } from "bun:test";
import { projectApi } from "../lib/project-assets/client";
import { uploadFixture } from "./project-assets-upload.fixture";

describe("project asset client routes", () => {
	test("uses the seven resource endpoints", async () => {
		const f = uploadFixture();
		const list = {
			items: [f.creation.asset],
			page: 1,
			pageSize: 25,
			total: 1,
			hasNextPage: false,
		};
		const responses = [
			list,
			f.creation,
			list,
			f.creation,
			f.ready,
			f.ready,
			{ assetId: "asset", status: "DELETING" },
		];
		const originalFetch = globalThis.fetch;
		const fetchMock = mock(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(JSON.stringify(responses.shift()), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		try {
			await projectApi.listAssets("project", { page: 1, pageSize: 25 });
			await projectApi.createProjectAsset("project", assetBody(), "create");
			await projectApi.listAssets("project", {
				page: 1,
				pageSize: 25,
				appointmentId: "appointment",
			});
			await projectApi.createAppointmentAsset(
				"appointment",
				assetBody(),
				"appointment-create",
			);
			await projectApi.getAsset("asset");
			await projectApi.updateAsset(
				"asset",
				{ uploadCompleted: true },
				"complete",
			);
			await projectApi.deleteAsset("asset", "delete");
		} finally {
			globalThis.fetch = originalFetch;
		}

		expect(
			fetchMock.mock.calls.map((call) => [
				call[1]?.method,
				new URL(String(call[0]), "https://app.test").pathname,
			]),
		).toEqual([
			["GET", "/api/projects/project/assets"],
			["POST", "/api/projects/project/assets"],
			["GET", "/api/appointments/appointment/assets"],
			["POST", "/api/appointments/appointment/assets"],
			["GET", "/api/assets/asset"],
			["PATCH", "/api/assets/asset"],
			["DELETE", "/api/assets/asset"],
		]);
	});
});

function assetBody() {
	return {
		fileName: "plan.txt",
		contentType: "text/plain",
		sizeBytes: 4,
		kind: "document",
		source: "MANUAL" as const,
	};
}
