import type { Prisma } from "@crm/db";
import type { AssetActor } from "./asset-actor";
import { AssetError } from "./asset-error";

export function missing(): never {
	throw new AssetError(
		404,
		"RESOURCE_NOT_FOUND",
		"The record does not exist or is inaccessible.",
	);
}

export async function findAssetProject(
	tx: Prisma.TransactionClient,
	actor: AssetActor,
	projectId: string,
	lock = false,
) {
	if (lock)
		await tx.$queryRaw`SELECT "id" FROM "deal" WHERE "id" = ${projectId} FOR UPDATE`;
	const project = await tx.deal.findUnique({ where: { id: projectId } });
	if (!project) missing();
	if (actor.type === "USER") {
		if (
			!(await tx.user.findUnique({
				where: { id: actor.userId },
				select: { id: true },
			}))
		)
			missing();
	} else {
		const message = await tx.emailMessage.findUnique({
			where: { id: actor.messageId },
			include: { thread: true },
		});
		if (!message || message.syncedByUserId !== actor.mailboxOwnerId) missing();
		const mailboxSources: string[] = [];
		if (message.gmailMessageId) mailboxSources.push("gmail");
		if (message.outlookMessageId) mailboxSources.push("outlook");
		if (
			!(await tx.mailboxSync.findFirst({
				where: {
					userId: actor.mailboxOwnerId,
					source: { in: mailboxSources },
				},
				select: { id: true },
			}))
		)
			missing();
		if (
			message.thread.companyId !== null &&
			message.thread.companyId !== project.companyId
		) {
			throw new AssetError(
				409,
				"PROJECT_MISMATCH",
				"The email belongs to another customer.",
			);
		}
	}
	return project;
}

export function requireActiveProject(project: { archivedAt: Date | null }) {
	if (project.archivedAt)
		throw new AssetError(
			409,
			"PROJECT_ARCHIVED",
			"Restore the project before uploading files.",
		);
}

export async function findAssetUpload(
	tx: Prisma.TransactionClient,
	projectId: string,
	uploadId: string,
	actor: AssetActor,
) {
	const upload = await tx.assetUpload.findFirst({
		where: { id: uploadId, projectId },
	});
	if (!upload) missing();
	if (
		actor.type === "SYSTEM" &&
		(upload.emailMessageId !== actor.messageId ||
			upload.mailboxOwnerId !== actor.mailboxOwnerId)
	)
		missing();
	return upload;
}

export async function findProjectAsset(
	tx: Prisma.TransactionClient,
	projectId: string,
	assetId: string,
	actor: AssetActor,
) {
	const asset = await tx.artifact.findFirst({
		where: { id: assetId, dealId: projectId },
		include: { deal: { select: { companyId: true } } },
	});
	if (!asset) missing();
	if (actor.type === "SYSTEM" && asset.emailMessageId !== actor.messageId)
		missing();
	return asset;
}

export async function validateUploadActivity(
	tx: Prisma.TransactionClient,
	projectId: string,
	activityId?: string | null,
) {
	if (!activityId) return;
	const activity = await tx.activity.findUnique({
		where: { id: activityId },
	});
	if (!activity) missing();
	if (activity.type !== "MEETING" || activity.dealId !== projectId)
		throw new AssetError(
			409,
			"PROJECT_MISMATCH",
			"The meeting belongs to another project.",
		);
}
