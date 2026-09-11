import type { Db, Prisma } from "@crm/db";
import { currentOrganizationId } from "@crm/db/tenant-context";
import { missing } from "../assets/asset-access.service";
import type { AssetActor } from "../assets/asset-actor";

export async function appointmentActor(
	db: Pick<Db, "member">,
	actor: AssetActor,
) {
	if (actor.type !== "USER") missing();
	await appointmentOwner(db, actor.userId);
	return actor.userId;
}

export async function appointmentOwner(
	db: Pick<Db, "member">,
	ownerId: string,
) {
	if (
		!(await db.member.findFirst({
			where: { organizationId: currentOrganizationId(), userId: ownerId },
			select: { id: true },
		}))
	)
		missing();
}

export const appointmentInclude = {
	appointmentDetails: true,
	deal: { select: { companyId: true, organizationId: true } },
} as const;

export async function findAppointment(
	tx: Prisma.TransactionClient,
	projectId: string,
	appointmentId: string,
) {
	const row = await tx.activity.findFirst({
		where: {
			id: appointmentId,
			dealId: projectId,
			type: "MEETING",
			appointmentDetails: { isNot: null },
		},
		include: appointmentInclude,
	});
	if (
		!row?.appointmentDetails ||
		!row.deal ||
		row.organizationId !== row.appointmentDetails.organizationId ||
		row.organizationId !== row.deal.organizationId
	)
		missing();
	return { ...row, appointmentDetails: row.appointmentDetails };
}

export function appointmentResponse(
	row: Prisma.ActivityGetPayload<{ include: typeof appointmentInclude }>,
) {
	const details = row.appointmentDetails;
	if (!details || !row.deal || !row.dealId || !row.subject) missing();
	return {
		id: row.id,
		projectId: row.dealId,
		customerId: row.deal.companyId,
		title: row.subject,
		notes: row.body,
		startsAt: details.startsAt.toISOString(),
		endsAt: details.endsAt?.toISOString() ?? null,
		timeZone: details.timeZone,
		location: details.location,
		ownerId: details.ownerId,
		status: details.status,
		statusChangedAt: details.statusChangedAt.toISOString(),
		version: details.version,
		archivedAt: row.archivedAt?.toISOString() ?? null,
		createdById: row.createdById,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}
