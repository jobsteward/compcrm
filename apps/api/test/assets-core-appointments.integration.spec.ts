import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
} from "bun:test";
import { scopedDb as db } from "@crm/db/tenant-scope";
import {
	AssetsCoreFixture,
	assertLocalTestDatabase,
	assetTest as it,
} from "./assets-core.fixture";

let fixture: AssetsCoreFixture;
let service: AssetsCoreFixture["service"];
let actor: AssetsCoreFixture["actor"];
let userId: AssetsCoreFixture["userId"];
let projectId: AssetsCoreFixture["projectId"];
let otherProjectId: AssetsCoreFixture["otherProjectId"];
let create: AssetsCoreFixture["create"];

describe("asset appointment resources", () => {
	beforeAll(async () => {
		await assertLocalTestDatabase();
	});

	beforeEach(async () => {
		fixture = new AssetsCoreFixture();
		await fixture.setup();
		service = fixture.service;
		actor = fixture.actor;
		userId = fixture.userId;
		projectId = fixture.projectId;
		otherProjectId = fixture.otherProjectId;
		create = fixture.create.bind(fixture);
	});

	afterEach(async () => {
		await fixture.cleanup();
	});

	afterAll(async () => {
		await db.$disconnect();
	});

	it("requires a managed appointment for appointment asset creation", async () => {
		const note = await db.activity.create({
			data: { type: "NOTE", dealId: projectId, createdById: userId },
		});
		await expect(create({ appointmentId: note.id })).rejects.toMatchObject({
			code: "RESOURCE_NOT_FOUND",
		});
		const genericMeeting = await db.activity.create({
			data: { type: "MEETING", dealId: otherProjectId, createdById: userId },
		});
		await expect(
			create({ appointmentId: genericMeeting.id }),
		).rejects.toMatchObject({
			code: "RESOURCE_NOT_FOUND",
		});
		await expect(create({ appointmentId: "absent" })).rejects.toMatchObject({
			code: "RESOURCE_NOT_FOUND",
		});
		const managed = await db.activity.create({
			data: { type: "MEETING", dealId: projectId, createdById: userId },
		});
		await db.appointmentDetails.create({
			data: {
				activityId: managed.id,
				startsAt: new Date("2026-09-01T15:00:00.000Z"),
				timeZone: "America/Chicago",
				ownerId: userId,
			},
		});
		const created = await create({ appointmentId: managed.id });
		expect(created.asset).toMatchObject({
			appointmentId: managed.id,
			status: "UNVERIFIED",
		});
		const listed = await service.listAppointmentAssets(actor, managed.id, {
			page: 1,
			pageSize: 25,
		});
		expect(listed.items.map((asset) => asset.id)).toEqual([created.asset.id]);
	});
});
