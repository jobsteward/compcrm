import { expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { invalidateProjectWorkspace } from "../lib/project-assets/cache";
import { projectKeys } from "../lib/project-assets/queries";

test("appointment mutations refresh project data and existing CRM activity consumers", async () => {
	const client = new QueryClient();
	const project = projectKeys.appointment("project", "appointment");
	const other = projectKeys.appointment("other", "appointment");
	client.setQueryData(project, { title: "Old title" });
	client.setQueryData(other, { title: "Other project" });
	const activity = mock(async () => {});
	await invalidateProjectWorkspace(client, { activity }, "project");
	expect(client.getQueryState(project)?.isInvalidated).toBe(true);
	expect(client.getQueryState(other)?.isInvalidated).toBe(false);
	expect(activity).toHaveBeenCalledTimes(1);
	client.clear();
});
