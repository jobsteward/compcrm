import { expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import { runInTenant } from "@crm/db/tenant-context";
import { scopedDb } from "@crm/db/tenant-scope";
import { appointmentError, appointmentFixture } from "./appointments.fixture";

const f = appointmentFixture();

f.test(
	"replays create and update before stale version checks and rejects changed bodies",
	async () => {
		const key = randomUUID();
		const first = await f.create({}, key);
		expect(await f.create({}, key)).toEqual(first);
		await appointmentError(
			f.create({ title: "Changed" }, key),
			"IDEMPOTENCY_CONFLICT",
		);
		const id = first.appointment.id;
		const editKey = randomUUID();
		const body = { expectedVersion: 1, notes: "Saved" };
		const edited = await f.service.updateAppointment(
			f.actor,
			f.projectId,
			id,
			body,
			editKey,
		);
		await f.service.updateAppointment(
			f.actor,
			f.projectId,
			id,
			{ expectedVersion: 2, title: "Next" },
			randomUUID(),
		);
		expect(
			await f.service.updateAppointment(
				f.actor,
				f.projectId,
				id,
				body,
				editKey,
			),
		).toEqual(edited);
		await appointmentError(
			f.service.updateAppointment(f.actor, f.projectId, id, body, randomUUID()),
			"VERSION_CONFLICT",
		);
		await f.service.archiveAppointment(f.actor, f.projectId, id, randomUUID());
		expect(
			await f.service.updateAppointment(
				f.actor,
				f.projectId,
				id,
				body,
				editKey,
			),
		).toEqual(edited);
		await scopedDb.activity.delete({ where: { id } });
		await appointmentError(
			f.service.updateAppointment(f.actor, f.projectId, id, body, editKey),
			"RESOURCE_NOT_FOUND",
		);
	},
);

f.test("rejects missing, other-project and generic meeting IDs", async () => {
	const { appointment: a } = await f.create();
	await appointmentError(
		f.service.getAppointment(f.actor, f.otherProjectId, a.id),
		"RESOURCE_NOT_FOUND",
	);
	await appointmentError(
		f.service.updateAppointment(
			f.actor,
			f.otherProjectId,
			a.id,
			{ expectedVersion: 1, title: "Other" },
			randomUUID(),
		),
		"RESOURCE_NOT_FOUND",
	);
	const generic = await scopedDb.activity.create({
		data: { type: "MEETING", dealId: f.projectId, createdById: f.userId },
	});
	for (const id of [randomUUID(), generic.id]) {
		await appointmentError(
			f.service.getAppointment(f.actor, f.projectId, id),
			"RESOURCE_NOT_FOUND",
		);
		await appointmentError(
			f.service.archiveAppointment(f.actor, f.projectId, id, randomUUID()),
			"RESOURCE_NOT_FOUND",
		);
	}
});

f.test(
	"enforces assigned-owner membership and denies saved replay after actor membership loss",
	async () => {
		await appointmentError(
			f.create({ ownerId: randomUUID() }),
			"RESOURCE_NOT_FOUND",
		);
		const key = randomUUID();
		await f.create({}, key);
		const membership = await db.member.findFirstOrThrow({
			where: { userId: f.userId, organizationId: f.organizationId },
		});
		await db.member.delete({ where: { id: membership.id } });
		try {
			await appointmentError(f.create({}, key), "RESOURCE_NOT_FOUND");
		} finally {
			await db.member.create({ data: membership });
		}
	},
);

f.test(
	"isolates appointment details and project reads across organizations",
	async () => {
		const { appointment: a } = await f.create();
		const otherOrganization = randomUUID();
		await db.organization.create({
			data: {
				id: otherOrganization,
				name: "Other",
				slug: otherOrganization,
				createdAt: new Date(),
			},
		});
		await db.member.create({
			data: {
				id: randomUUID(),
				organizationId: otherOrganization,
				userId: f.userId,
				role: "member",
				createdAt: new Date(),
			},
		});
		try {
			await runInTenant(otherOrganization, async () => {
				expect(
					await scopedDb.appointmentDetails.findUnique({
						where: { activityId: a.id },
					}),
				).toBeNull();
				await appointmentError(
					f.service.getAppointment(f.actor, f.projectId, a.id),
					"RESOURCE_NOT_FOUND",
				);
				await appointmentError(
					f.service.listAppointments(f.actor, f.projectId, {}),
					"RESOURCE_NOT_FOUND",
				);
				await appointmentError(
					f.service.updateAppointment(
						f.actor,
						f.projectId,
						a.id,
						{ expectedVersion: 1, title: "Cross tenant" },
						randomUUID(),
					),
					"RESOURCE_NOT_FOUND",
				);
			});
		} finally {
			await db.organization.delete({ where: { id: otherOrganization } });
		}
	},
);

f.test(
	"serializes updates from two actors so exactly one expected version succeeds",
	async () => {
		const { appointment: a } = await f.create();
		const results = await Promise.allSettled(
			[f.actor, { type: "USER" as const, userId: f.otherUserId }].map((actor) =>
				f.service.updateAppointment(
					actor,
					f.projectId,
					a.id,
					{ expectedVersion: 1, title: actor.userId },
					randomUUID(),
				),
			),
		);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		const rejected = results.find((r) => r.status === "rejected");
		expect(rejected?.status === "rejected" && rejected.reason.code).toBe(
			"VERSION_CONFLICT",
		);
	},
);
