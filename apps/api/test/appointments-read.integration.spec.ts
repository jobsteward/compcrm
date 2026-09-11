import { expect } from "bun:test";
import { randomUUID } from "node:crypto";
import type { Db } from "@crm/db";
import { scopedDb } from "@crm/db/tenant-scope";
import { timelineInput } from "../src/activities/activities.contracts";
import { ActivitiesService } from "../src/activities/activities.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DashboardService } from "../src/dashboard/dashboard.service";
import { appointmentError, appointmentFixture } from "./appointments.fixture";

const f = appointmentFixture();
const serviceDb = scopedDb as unknown as Db;
const stamp = new ActivityStampService(serviceDb);
const activities = new ActivitiesService(serviceDb, stamp);

f.test(
	"filters and paginates managed appointments by start, owner, status and archive",
	async () => {
		const { appointment: first } = await f.create({
			startsAt: "2025-01-01T00:00:00Z",
		});
		const { appointment: second } = await f.create({
			startsAt: "2025-01-02T00:00:00Z",
			ownerId: f.otherUserId,
			status: "COMPLETED",
		});
		await scopedDb.activity.create({
			data: { dealId: f.projectId, type: "MEETING", createdById: f.userId },
		});
		const page = await f.service.listAppointments(f.actor, f.projectId, {
			pageSize: 1,
		});
		expect(page).toMatchObject({
			total: 2,
			page: 1,
			pageSize: 1,
			hasNextPage: true,
		});
		expect(page.items[0]?.id).toBe(first.id);
		const next = await f.service.listAppointments(f.actor, f.projectId, {
			page: 2,
			pageSize: 1,
		});
		expect(next.items[0]?.id).toBe(second.id);
		expect(next.hasNextPage).toBe(false);
		const filtered = await f.service.listAppointments(f.actor, f.projectId, {
			from: first.startsAt,
			to: second.startsAt,
		});
		expect(filtered.items.map((a) => a.id)).toEqual([first.id]);
		expect(
			(
				await f.service.listAppointments(f.actor, f.projectId, {
					status: "COMPLETED",
					ownerId: f.otherUserId,
				})
			).items.map((a) => a.id),
		).toEqual([second.id]);
		await appointmentError(
			f.service.listAppointments(f.actor, f.projectId, {
				from: second.startsAt,
				to: first.startsAt,
			}),
			"VALIDATION_ERROR",
		);
		await f.service.archiveAppointment(
			f.actor,
			f.projectId,
			first.id,
			randomUUID(),
		);
		expect(
			(await f.service.listAppointments(f.actor, f.projectId, {})).items.map(
				(a) => a.id,
			),
		).toEqual([second.id]);
		expect(
			(
				await f.service.listAppointments(f.actor, f.projectId, {
					archived: true,
				})
			).items.map((a) => a.id),
		).toEqual([first.id]);
	},
);

f.test(
	"archives timeline and dashboard entries while preserving files, stamps and retained activity totals",
	async () => {
		const { appointment: a } = await f.create({
			startsAt: "2099-01-01T00:00:00Z",
		});
		const asset = await scopedDb.artifact.create({
			data: {
				dealId: f.projectId,
				type: "photo",
				fileName: "retained.jpg",
				storageKey: randomUUID(),
				activityId: a.id,
			},
		});
		await stamp.recompute({ dealId: f.projectId, companyId: f.companyId });
		const before = await scopedDb.deal.findUniqueOrThrow({
			where: { id: f.projectId },
		});
		const total = await scopedDb.activity.count({
			where: { dealId: f.projectId },
		});
		const dashboard = new DashboardService(
			serviceDb,
			new ConversionService(serviceDb),
		);
		expect(
			(await dashboard.summary(f.userId, { scope: "me" })).recentActivity.some(
				(row) => row.id === a.id,
			),
		).toBe(true);
		const activeBefore = await activities.timelineCounts({
			dealId: f.projectId,
		});
		await f.service.archiveAppointment(
			f.actor,
			f.projectId,
			a.id,
			randomUUID(),
		);
		expect((await activities.timelineCounts({ dealId: f.projectId })).all).toBe(
			activeBefore.all - 1,
		);
		expect(
			(
				await activities.timeline(timelineInput.parse({ dealId: f.projectId }))
			).entries.some((row) => row.id === a.id),
		).toBe(false);
		expect(
			(
				await activities.timeline(
					timelineInput.parse({ dealId: f.projectId, archived: true }),
				)
			).entries.some((row) => row.id === a.id),
		).toBe(true);
		expect(
			(await dashboard.summary(f.userId, { scope: "me" })).recentActivity.some(
				(row) => row.id === a.id,
			),
		).toBe(false);
		expect(
			(await scopedDb.deal.findUniqueOrThrow({ where: { id: f.projectId } }))
				.lastActivityAt,
		).toEqual(before.lastActivityAt);
		expect(
			await scopedDb.activity.count({ where: { dealId: f.projectId } }),
		).toBe(total);
		expect(
			(await scopedDb.artifact.findUniqueOrThrow({ where: { id: asset.id } }))
				.activityId,
		).toBe(a.id);
		await f.service.updateAppointment(
			f.actor,
			f.projectId,
			a.id,
			{ expectedVersion: 2, archived: false },
			randomUUID(),
		);
		expect((await activities.timelineCounts({ dealId: f.projectId })).all).toBe(
			activeBefore.all,
		);
		expect(
			(await dashboard.summary(f.userId, { scope: "me" })).recentActivity.some(
				(row) => row.id === a.id,
			),
		).toBe(true);
		expect(
			(await scopedDb.deal.findUniqueOrThrow({ where: { id: f.projectId } }))
				.lastActivityAt,
		).toEqual(before.lastActivityAt);
	},
);

f.test(
	"places future scheduled appointments after dated timeline entries",
	async () => {
		const { appointment: a } = await f.create({
			startsAt: "2099-01-01T00:00:00Z",
		});
		const { appointment: b } = await f.create({ status: "COMPLETED" });
		const timeline = await activities.timeline(
			timelineInput.parse({ dealId: f.projectId, limit: 100 }),
		);
		expect(timeline.entries.findIndex((row) => row.id === b.id)).toBeLessThan(
			timeline.entries.findIndex((row) => row.id === a.id),
		);
	},
);
