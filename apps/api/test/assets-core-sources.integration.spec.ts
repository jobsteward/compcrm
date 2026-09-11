import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { scopedDb as db } from "@crm/db/tenant-scope";
import type { AssetActor } from "../src/assets/assets.service";
import {
	AssetsCoreFixture,
	assertLocalTestDatabase,
	assetTest as it,
} from "./assets-core.fixture";

let fixture: AssetsCoreFixture;
let service: AssetsCoreFixture["service"];
let worker: AssetsCoreFixture["worker"];
let actor: AssetsCoreFixture["actor"];
let userId: AssetsCoreFixture["userId"];
let projectId: AssetsCoreFixture["projectId"];
let otherProjectId: AssetsCoreFixture["otherProjectId"];
let metadata: AssetsCoreFixture["metadata"];
let create: AssetsCoreFixture["create"];
let put: AssetsCoreFixture["put"];
let ready: AssetsCoreFixture["ready"];
let email: AssetsCoreFixture["email"];

describe("asset email sources", () => {
	beforeAll(async () => {
		await assertLocalTestDatabase();
	});

	beforeEach(async () => {
		fixture = new AssetsCoreFixture();
		await fixture.setup();
		service = fixture.service;
		worker = fixture.worker;
		actor = fixture.actor;
		userId = fixture.userId;
		projectId = fixture.projectId;
		otherProjectId = fixture.otherProjectId;
		metadata = fixture.metadata.bind(fixture);
		create = fixture.create.bind(fixture);
		put = fixture.put.bind(fixture);
		ready = fixture.ready.bind(fixture);
		email = fixture.email.bind(fixture);
	});

	afterEach(async () => {
		await fixture.cleanup();
	});

	afterAll(async () => {
		await db.$disconnect();
	});

	it("deduplicates email occurrences and preserves the project binding", async () => {
		const emailSource = await email();
		const input = { source: "EMAIL_ATTACHMENT" as const, emailSource };
		const first = await create(input);
		const duplicate = await create(input);
		expect(duplicate.upload.id).toBe(first.upload.id);
		await expect(create({ ...input, sizeBytes: 9 })).rejects.toMatchObject({
			code: "SOURCE_CONFLICT",
		});
		await expect(
			service.createProjectAsset(
				actor,
				otherProjectId,
				metadata(input),
				randomUUID(),
			),
		).rejects.toMatchObject({ code: "PROJECT_MISMATCH" });
		await service.deleteAsset(actor, first.asset.id, randomUUID());
		await expect(create(input)).rejects.toMatchObject({
			code: "SOURCE_DELETED",
		});
		const distinct = await create({
			...input,
			emailSource: { ...emailSource, attachmentId: "gmail-part:2" },
		});
		expect(distinct.upload.id).not.toBe(first.upload.id);
		expect(await db.assetEmailSource.count({ where: { projectId } })).toBe(2);
	});
	it("preserves email deletion markers after artifact-row removal", async () => {
		const emailSource = await email();
		const result = await ready({ source: "EMAIL_ATTACHMENT", emailSource });
		const duplicate = await create({ source: "EMAIL_ATTACHMENT", emailSource });
		expect(duplicate.transfer).toBeNull();
		expect(duplicate.upload.assetId).toBe(result.assetId);
		await service.deleteAsset(actor, result.assetId, randomUUID());
		await worker.process();
		await db.artifact.delete({ where: { id: result.assetId } });
		await expect(
			create({ source: "EMAIL_ATTACHMENT", emailSource }),
		).rejects.toMatchObject({ code: "SOURCE_DELETED" });
	});
	it("verifies the system mailbox actor and stores null uploader attribution", async () => {
		const emailSource = await email();
		const system: AssetActor = {
			type: "SYSTEM",
			mailboxOwnerId: userId,
			messageId: emailSource.messageId,
		};
		await expect(
			service.createProjectAsset(
				system,
				projectId,
				metadata({ source: "EMAIL_ATTACHMENT", emailSource }),
				randomUUID(),
			),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
		await db.mailboxSync.create({ data: { userId, source: "gmail" } });
		const result = await service.createProjectAsset(
			system,
			projectId,
			metadata({ source: "EMAIL_ATTACHMENT", emailSource }),
			randomUUID(),
		);
		const createdUpload = await db.assetUpload.findUniqueOrThrow({
			where: { assetId: result.asset.id },
		});
		await put(createdUpload.id);
		await service.updateAsset(
			system,
			result.asset.id,
			{ uploadCompleted: true },
			randomUUID(),
		);
		await worker.process();
		const upload = await db.assetUpload.findUniqueOrThrow({
			where: { id: createdUpload.id },
		});
		expect(upload.uploadedById).toBeNull();
		expect(upload.mailboxOwnerId).toBe(userId);
		expect(
			(await service.getAsset(system, upload.assetId as string)).asset
				.uploadedById,
		).toBeNull();
	});
});
