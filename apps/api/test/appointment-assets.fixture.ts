import { randomUUID } from "node:crypto";
import { db as rawDb } from "@crm/db";
import { scopedDb } from "@crm/db/tenant-scope";
import type { AppointmentCreateInput } from "../src/appointments/appointments.contracts";
import { AppointmentsService } from "../src/appointments/appointments.service";
import type { AssetActor } from "../src/assets/assets.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { GoogleConnectionService } from "../src/google/google-connection.service";
import {
	AssetsCoreFixture,
	assertLocalTestDatabase,
} from "./assets-core.fixture";
import {
	addAssetTestMember,
	assetTest,
	inAssetTenant,
	removeAssetTestMember,
} from "./assets-tenant.fixture";

export { assertLocalTestDatabase, assetTest, inAssetTenant, rawDb, scopedDb };

export class AppointmentAssetsFixture {
	readonly assets = new AssetsCoreFixture();
	readonly appointments = new AppointmentsService(rawDb);
	readonly google = new GoogleConnectionService(
		rawDb,
		scopedDb as never,
		{} as never,
		{} as never,
		{} as never,
		new ActivityStampService(scopedDb as never),
	);
	actor!: AssetActor;
	otherActor!: AssetActor;
	otherUserId!: string;

	async setup() {
		await this.assets.setup();
		this.actor = this.assets.actor;
		this.otherUserId = randomUUID();
		await rawDb.user.create({
			data: {
				id: this.otherUserId,
				name: `${this.assets.run}-other`,
				email: `${this.otherUserId}@assets.test`,
			},
		});
		await addAssetTestMember(this.otherUserId, randomUUID());
		this.otherActor = { type: "USER", userId: this.otherUserId };
	}

	async cleanup() {
		try {
			await this.assets.cleanup();
		} finally {
			await removeAssetTestMember(this.otherUserId);
			await rawDb.user.deleteMany({ where: { id: this.otherUserId } });
		}
	}

	appointment(
		overrides: Partial<AppointmentCreateInput> = {},
		actor = this.actor,
		projectId = this.assets.projectId,
		key = randomUUID(),
	) {
		return inAssetTenant(() =>
			this.appointments.createAppointment(
				actor,
				projectId,
				{
					title: "Kitchen site visit",
					startsAt: "2099-09-10T15:00:00Z",
					timeZone: "America/Chicago",
					...overrides,
				},
				key,
			),
		);
	}

	archive(appointmentId: string, actor = this.actor, key = randomUUID()) {
		return inAssetTenant(() =>
			this.appointments.archiveAppointment(
				actor,
				this.assets.projectId,
				appointmentId,
				key,
			),
		);
	}

	createUpload(
		input: Parameters<AssetsCoreFixture["create"]>[0] = {},
		actor = this.actor,
		key = randomUUID(),
	) {
		return inAssetTenant(() =>
			this.assets.service.createUpload(
				actor,
				this.assets.projectId,
				this.assets.metadata(input),
				key,
			),
		);
	}

	ready(input: Parameters<AssetsCoreFixture["ready"]>[0] = {}) {
		return inAssetTenant(() => this.assets.ready(input));
	}

	updateAsset(
		assetId: string,
		input: Parameters<AssetsCoreFixture["service"]["updateAsset"]>[3],
		actor = this.actor,
		key = randomUUID(),
	) {
		return inAssetTenant(() =>
			this.assets.service.updateAsset(
				actor,
				this.assets.projectId,
				assetId,
				input,
				key,
			),
		);
	}
}
