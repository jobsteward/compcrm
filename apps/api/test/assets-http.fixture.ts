import { spyOn } from "bun:test";
import { randomUUID } from "node:crypto";
import type { Db } from "@crm/db";
import { scopedDb } from "@crm/db/tenant-scope";
import type { INestApplication } from "@nestjs/common";
import { AssetStorageService } from "../src/assets/asset-storage.service";
import type { RequestPrincipal } from "../src/auth/request-principal";
import { RequestPrincipalService } from "../src/auth/request-principal.service";
import {
	ASSET_TEST_ORGANIZATION_ID,
	addAssetTestMember,
	inAssetTenant,
	removeAssetTestMember,
} from "./assets-tenant.fixture";

export class AssetsHttpFixture {
	readonly prefix = `asset-http-${randomUUID()}`;
	readonly projectId = `${this.prefix}-project`;
	readonly otherProjectId = `${this.prefix}-other-project`;
	readonly customerId = `${this.prefix}-customer`;
	readonly userId = `${this.prefix}-user`;
	readonly base = `/projects/${this.projectId}`;
	readonly metadata = {
		fileName: "evidence.unusual",
		sizeBytes: 0,
		source: "MANUAL",
	};
	readonly objects = new Map<
		string,
		{ sizeBytes: number; etag: string; contentType: string | null }
	>();
	app!: INestApplication;
	db!: Db;
	principal!: RequestPrincipal;
	private restores: Array<() => void> = [];

	async setup() {
		const testUrl = process.env.TEST_DATABASE_URL;
		if (!testUrl || !new URL(testUrl).pathname.endsWith("_test"))
			throw new Error("A disposable TEST_DATABASE_URL is required.");
		process.env.DATABASE_URL = testUrl;
		({ db: this.db } = await import("@crm/db"));
		const user = await this.db.user.create({
			data: {
				id: this.userId,
				email: `${this.prefix}@example.com`,
				name: "Asset HTTP test",
				emailVerified: true,
			},
		});
		await addAssetTestMember(this.userId, randomUUID());
		await inAssetTenant(async () => {
			await scopedDb.company.create({
				data: { id: this.customerId, name: "Asset HTTP test" },
			});
			await scopedDb.deal.createMany({
				data: [this.projectId, this.otherProjectId].map((id) => ({
					id,
					name: id,
					companyId: this.customerId,
					ownerId: this.userId,
				})),
			});
		});
		this.principal = {
			credentialKind: "oauth",
			user,
			clientId: "asset-test-client",
			scopes: new Set(["crm.read", "crm.write"]),
			session: null,
			organizationId: ASSET_TEST_ORGANIZATION_ID,
			expiresAt: null,
		};
		const { createApp } = await import("../src/create-app");
		this.app = await createApp();
		const resolve = spyOn(
			this.app.get(RequestPrincipalService),
			"resolve",
		).mockImplementation(async (req) => {
			if (req.header("x-asset-test-user") !== this.userId) return null;
			const scope = req.header("x-asset-test-scope");
			return scope
				? { ...this.principal, scopes: new Set([scope]) }
				: this.principal;
		});
		const storage = this.app.get(AssetStorageService);
		const mocks = [
			resolve,
			spyOn(storage, "configured").mockReturnValue(true),
			spyOn(storage, "bucket").mockReturnValue("asset-tests"),
			spyOn(storage, "presignPut").mockImplementation(
				async (_bucket, key) => `https://storage.invalid/${key}?signed=put`,
			),
			spyOn(storage, "presignGet").mockImplementation(
				async (_bucket, key) => `https://storage.invalid/${key}?signed=get`,
			),
			spyOn(storage, "head").mockImplementation(
				async (_bucket, key) => this.objects.get(key) ?? null,
			),
			spyOn(storage, "copy").mockImplementation(
				async (_bucket, source, target, etag) => {
					const object = this.objects.get(source);
					if (!object || object.etag !== etag)
						throw new Error("Source changed.");
					this.objects.set(target, { ...object });
				},
			),
			spyOn(storage, "delete").mockImplementation(async (_bucket, key) => {
				this.objects.delete(key);
			}),
		];
		this.restores = mocks.map((mock) => () => mock.mockRestore());
	}

	async cleanup() {
		for (const restore of this.restores) restore();
		if (this.app) await this.app.close();
		if (!this.db) return;
		await inAssetTenant(async () => {
			await scopedDb.assetStorageJob.deleteMany({
				where: { projectId: { in: [this.projectId, this.otherProjectId] } },
			});
			await scopedDb.assetApiRequest.deleteMany({
				where: { actorKey: `user:${this.userId}` },
			});
			await scopedDb.assetEmailSource.deleteMany({
				where: { projectId: { in: [this.projectId, this.otherProjectId] } },
			});
			await scopedDb.assetUpload.deleteMany({
				where: { projectId: { in: [this.projectId, this.otherProjectId] } },
			});
			await scopedDb.deal.deleteMany({
				where: { id: { in: [this.projectId, this.otherProjectId] } },
			});
			await scopedDb.company.delete({ where: { id: this.customerId } });
		});
		await removeAssetTestMember(this.userId);
		await this.db.user.delete({ where: { id: this.userId } });
	}
}
