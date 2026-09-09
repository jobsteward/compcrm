import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import { runInTenant } from "@crm/db/tenant-context";
import { tenantTest } from "@crm/db/test-support";

export const ASSET_TEST_ORGANIZATION_ID = `asset-tests-${randomUUID()}`;
export const assetTest = tenantTest(ASSET_TEST_ORGANIZATION_ID);

export async function inAssetTenant<T>(
	work: () => T | PromiseLike<T>,
): Promise<T> {
	return await runInTenant(ASSET_TEST_ORGANIZATION_ID, work);
}

export async function addAssetTestMember(
	userId: string,
	memberId: string,
): Promise<void> {
	await db.organization.upsert({
		where: { id: ASSET_TEST_ORGANIZATION_ID },
		update: {},
		create: {
			id: ASSET_TEST_ORGANIZATION_ID,
			name: "Asset tests",
			slug: ASSET_TEST_ORGANIZATION_ID,
			createdAt: new Date(),
		},
	});
	await db.member.create({
		data: {
			id: memberId,
			organizationId: ASSET_TEST_ORGANIZATION_ID,
			userId,
			role: "member",
			createdAt: new Date(),
		},
	});
}

export async function removeAssetTestMember(userId: string): Promise<void> {
	await db.member.deleteMany({
		where: { organizationId: ASSET_TEST_ORGANIZATION_ID, userId },
	});
	await db.organization.deleteMany({
		where: {
			id: ASSET_TEST_ORGANIZATION_ID,
			members: { none: {} },
		},
	});
}
