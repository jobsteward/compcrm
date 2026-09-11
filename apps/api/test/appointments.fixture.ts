import { afterAll, beforeAll, expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import { runInTenant } from "@crm/db/tenant-context";
import { scopedTransaction } from "@crm/db/tenant-scope";
import { tenantTest } from "@crm/db/test-support";
import type { AppointmentCreateInput } from "../src/appointments/appointments.contracts";
import { AppointmentsService } from "../src/appointments/appointments.service";
import { AssetError } from "../src/assets/asset-error";

export function appointmentFixture() {
	const organizationId = randomUUID();
	const userId = randomUUID();
	const otherUserId = randomUUID();
	const companyId = randomUUID();
	const projectId = randomUUID();
	const otherProjectId = randomUUID();
	const actor = { type: "USER" as const, userId };
	const service = new AppointmentsService(db);
	const input = {
		title: "Site visit",
		startsAt: "2025-09-10T10:00:00-05:00",
		timeZone: "America/Chicago",
	};
	const within = <T>(work: () => Promise<T>) =>
		runInTenant(organizationId, work);
	beforeAll(async () => {
		await db.organization.create({
			data: {
				id: organizationId,
				name: "Appointment tests",
				slug: organizationId,
				createdAt: new Date(),
			},
		});
		for (const id of [userId, otherUserId]) {
			await db.user.create({
				data: { id, name: "Appointment tester", email: `${id}@example.com` },
			});
			await db.member.create({
				data: {
					id: randomUUID(),
					organizationId,
					userId: id,
					role: "member",
					createdAt: new Date(),
				},
			});
		}
		await within(() =>
			scopedTransaction(async (tx) => {
				await tx.company.create({
					data: { id: companyId, name: "Appointment customer" },
				});
				for (const id of [projectId, otherProjectId])
					await tx.deal.create({
						data: {
							id,
							companyId,
							ownerId: userId,
							name: "Appointment project",
						},
					});
			}),
		);
	});
	afterAll(async () => {
		await within(() =>
			scopedTransaction(async (tx) => {
				await tx.company.deleteMany({ where: { id: companyId } });
				await tx.assetApiRequest.deleteMany({ where: { organizationId } });
			}),
		);
		await db.organization.delete({ where: { id: organizationId } });
		await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
	});
	return {
		organizationId,
		userId,
		otherUserId,
		companyId,
		projectId,
		otherProjectId,
		actor,
		service,
		input,
		within,
		test: tenantTest(organizationId),
		create: (
			overrides: Partial<AppointmentCreateInput> = {},
			key = randomUUID(),
		) =>
			service.createAppointment(
				actor,
				projectId,
				{ ...input, ...overrides },
				key,
			),
	};
}

export async function appointmentError(work: Promise<unknown>, code: string) {
	try {
		await work;
		throw new Error(`Expected ${code}`);
	} catch (error) {
		expect(error).toBeInstanceOf(AssetError);
		expect((error as AssetError).code).toBe(code);
	}
}
