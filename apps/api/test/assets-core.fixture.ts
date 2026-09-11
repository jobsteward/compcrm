import { expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { db as rawDb } from "@crm/db";
import { scopedDb as db } from "@crm/db/tenant-scope";
import { AssetWorkerService } from "../src/assets/asset-worker.service";
import {
	type CreateAssetInput,
	createAssetInput,
} from "../src/assets/assets.contracts";
import { type AssetActor, AssetsService } from "../src/assets/assets.service";
import { MemoryStorage } from "./assets-core.storage.fixture";
import {
	addAssetTestMember,
	assetTest,
	inAssetTenant,
	removeAssetTestMember,
} from "./assets-tenant.fixture";

export { assetTest };

export class AssetsCoreFixture {
	readonly run = `assets-core-${randomUUID()}`;
	readonly projectIds: string[] = [];
	readonly threadIds: string[] = [];
	readonly storage = new MemoryStorage();
	readonly service = new AssetsService(rawDb, this.storage);
	readonly worker = new AssetWorkerService(rawDb, this.storage);
	actor!: AssetActor;
	userId!: string;
	companyId!: string;
	projectId!: string;
	otherProjectId!: string;

	async setup() {
		const user = await rawDb.user.create({
			data: {
				id: randomUUID(),
				name: this.run,
				email: `${randomUUID()}@assets.test`,
			},
		});
		this.userId = user.id;
		this.actor = { type: "USER", userId: this.userId };
		await addAssetTestMember(this.userId, randomUUID());
		await inAssetTenant(async () => {
			const company = await db.company.create({
				data: { name: this.run, domain: `${randomUUID()}.assets.test` },
			});
			this.companyId = company.id;
			const project = await db.deal.create({
				data: { name: "Kitchen", companyId: company.id, ownerId: this.userId },
			});
			const other = await db.deal.create({
				data: { name: "Bathroom", companyId: company.id, ownerId: this.userId },
			});
			this.projectId = project.id;
			this.otherProjectId = other.id;
		});
		this.projectIds.push(this.projectId, this.otherProjectId);
	}

	async cleanup() {
		if (!this.projectIds.length) return;
		await inAssetTenant(async () => {
			await db.assetStorageJob.deleteMany({
				where: { projectId: { in: this.projectIds } },
			});
			await db.assetEmailSource.deleteMany({
				where: { projectId: { in: this.projectIds } },
			});
			await db.assetUpload.deleteMany({
				where: { projectId: { in: this.projectIds } },
			});
			await db.assetApiRequest.deleteMany({
				where: {
					actorKey: { in: [`user:${this.userId}`, `mailbox:${this.userId}`] },
				},
			});
			await db.deal.deleteMany({ where: { id: { in: this.projectIds } } });
			await db.emailThread.deleteMany({
				where: { id: { in: this.threadIds } },
			});
			await db.company.delete({ where: { id: this.companyId } });
		});
		await removeAssetTestMember(this.userId);
		await rawDb.user.delete({ where: { id: this.userId } });
	}

	metadata(input: Partial<CreateAssetInput> = {}) {
		return createAssetInput.parse({
			fileName: "file.custom",
			sizeBytes: 4,
			source: "MANUAL",
			...input,
		});
	}

	async create(
		input: Partial<CreateAssetInput> & { appointmentId?: string } = {},
		key = randomUUID(),
	) {
		const { appointmentId, ...metadata } = input;
		const result = appointmentId
			? await this.service.createAppointmentAsset(
					this.actor,
					appointmentId,
					this.metadata(metadata),
					key,
				)
			: await this.service.createProjectAsset(
					this.actor,
					this.projectId,
					this.metadata(metadata),
					key,
				);
		const upload = await db.assetUpload.findUniqueOrThrow({
			where: { assetId: result.asset.id },
		});
		return { ...result, upload };
	}

	async put(uploadId: string, size = 4) {
		const upload = await db.assetUpload.findUniqueOrThrow({
			where: { id: uploadId },
		});
		this.storage.put(upload.temporaryKey, size);
		return upload;
	}

	async ready(
		input: Partial<CreateAssetInput> & { appointmentId?: string } = {},
	) {
		const created = await this.create(input);
		await this.put(created.upload.id, input.sizeBytes ?? 4);
		await this.service.updateAsset(
			this.actor,
			created.asset.id,
			{ uploadCompleted: true },
			randomUUID(),
		);
		await this.worker.process();
		const state = await this.service.getAsset(this.actor, created.asset.id);
		expect(state.asset.status).toBe("READY");
		expect(state.asset.version).toBe(1);
		return { uploadId: created.upload.id, assetId: state.asset.id };
	}

	async email(attachmentId = "gmail-part:1") {
		const thread = await db.emailThread.create({
			data: {
				rootMessageId: randomUUID(),
				companyId: this.companyId,
				firstMessageAt: new Date(),
				lastMessageAt: new Date(),
			},
		});
		this.threadIds.push(thread.id);
		const message = await db.emailMessage.create({
			data: {
				threadId: thread.id,
				rfcMessageId: randomUUID(),
				syncedByUserId: this.userId,
				gmailMessageId: randomUUID(),
				direction: "INBOUND",
				fromEmail: "sender@example.test",
				recipients: [],
				sentAt: new Date(),
			},
		});
		return { messageId: message.id, attachmentId };
	}

	async due() {
		await db.assetStorageJob.updateMany({
			where: { projectId: { in: this.projectIds }, state: "PENDING" },
			data: { nextAttemptAt: new Date(0) },
		});
	}
}

export async function assertLocalTestDatabase() {
	const url = new URL(process.env.TEST_DATABASE_URL ?? "");
	if (
		!["localhost", "127.0.0.1"].includes(url.hostname) ||
		!url.pathname.endsWith("_test")
	)
		throw new Error("Assets integration tests require a local test database.");
	const rows = await db.$queryRaw<Array<{ name: string }>>`
		SELECT current_database() AS name
	`;
	expect(rows[0]?.name).toBe(url.pathname.slice(1));
}
