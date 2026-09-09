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
let userId: AssetsCoreFixture["userId"];
let projectId: AssetsCoreFixture["projectId"];
let metadata: AssetsCoreFixture["metadata"];
let email: AssetsCoreFixture["email"];

describe("asset mailbox actors", () => {
	beforeAll(async () => {
		await assertLocalTestDatabase();
	});

	beforeEach(async () => {
		fixture = new AssetsCoreFixture();
		await fixture.setup();
		service = fixture.service;
		userId = fixture.userId;
		projectId = fixture.projectId;
		metadata = fixture.metadata.bind(fixture);
		email = fixture.email.bind(fixture);
	});

	afterEach(async () => {
		await fixture.cleanup();
	});

	afterAll(async () => {
		await db.$disconnect();
	});

	it("binds system upload operations to their verified email source", async () => {
		const firstSource = await email();
		const secondSource = await email();
		await db.mailboxSync.create({ data: { userId, source: "gmail" } });
		const firstActor: AssetActor = {
			type: "SYSTEM",
			mailboxOwnerId: userId,
			messageId: firstSource.messageId,
		};
		const secondActor: AssetActor = {
			type: "SYSTEM",
			mailboxOwnerId: userId,
			messageId: secondSource.messageId,
		};
		const created = await service.createUpload(
			secondActor,
			projectId,
			metadata({ source: "EMAIL_ATTACHMENT", emailSource: secondSource }),
			randomUUID(),
		);
		await expect(
			service.getUpload(firstActor, projectId, created.upload.id),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
		await expect(
			service.renewUpload(
				firstActor,
				projectId,
				created.upload.id,
				randomUUID(),
			),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
		await expect(
			service.confirmUpload(
				firstActor,
				projectId,
				created.upload.id,
				randomUUID(),
			),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
		await db.emailMessage.delete({ where: { id: secondSource.messageId } });
		await expect(
			service.renewUpload(
				secondActor,
				projectId,
				created.upload.id,
				randomUUID(),
			),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
	});
	it("rejects a system creation replay from a different message actor", async () => {
		const firstSource = await email();
		const secondSource = await email();
		await db.mailboxSync.create({ data: { userId, source: "gmail" } });
		const firstActor: AssetActor = {
			type: "SYSTEM",
			mailboxOwnerId: userId,
			messageId: firstSource.messageId,
		};
		const secondActor: AssetActor = {
			type: "SYSTEM",
			mailboxOwnerId: userId,
			messageId: secondSource.messageId,
		};
		const key = randomUUID();
		const input = metadata({
			source: "EMAIL_ATTACHMENT",
			emailSource: secondSource,
		});
		const created = await service.createUpload(
			secondActor,
			projectId,
			input,
			key,
		);
		await expect(
			service.createUpload(firstActor, projectId, input, key),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
		expect(
			await service.createUpload(secondActor, projectId, input, key),
		).toEqual(created);
		expect(await db.assetUpload.count({ where: { projectId } })).toBe(1);
	});
	it("rejects a revoked source mailbox even when another provider remains connected", async () => {
		const emailSource = await email();
		await db.mailboxSync.createMany({
			data: [
				{ userId, source: "gmail" },
				{ userId, source: "outlook" },
			],
		});
		const system: AssetActor = {
			type: "SYSTEM",
			mailboxOwnerId: userId,
			messageId: emailSource.messageId,
		};
		const key = randomUUID();
		const input = metadata({ source: "EMAIL_ATTACHMENT", emailSource });
		const created = await service.createUpload(system, projectId, input, key);
		await db.mailboxSync.deleteMany({
			where: { userId, source: "gmail" },
		});
		await expect(
			service.createUpload(system, projectId, input, key),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
		await expect(
			service.renewUpload(system, projectId, created.upload.id, randomUUID()),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
		expect(
			await db.mailboxSync.count({ where: { userId, source: "outlook" } }),
		).toBe(1);
	});
});
