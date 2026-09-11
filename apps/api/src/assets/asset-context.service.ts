import type { Db } from "@crm/db";
import { scopedTransaction } from "@crm/db/tenant-scope";
import {
	findAssetProject,
	findProjectAsset,
	missing,
	validateAssetAppointment,
} from "./asset-access.service";
import type { AssetActor } from "./asset-actor";

export function assetProjectId(db: Db, actor: AssetActor, assetId: string) {
	return scopedTransaction(db, async (tx) => {
		const asset = await tx.artifact.findUnique({ where: { id: assetId } });
		if (!asset) missing();
		await findAssetProject(tx, actor, asset.dealId);
		await findProjectAsset(tx, asset.dealId, assetId, actor);
		return asset.dealId;
	});
}

export function appointmentProjectId(
	db: Db,
	actor: AssetActor,
	appointmentId: string,
) {
	return scopedTransaction(db, async (tx) => {
		const appointment = await tx.activity.findUnique({
			where: { id: appointmentId },
		});
		if (!appointment?.dealId) missing();
		await findAssetProject(tx, actor, appointment.dealId);
		await validateAssetAppointment(
			tx,
			appointment.dealId,
			appointmentId,
			false,
		);
		return appointment.dealId;
	});
}
