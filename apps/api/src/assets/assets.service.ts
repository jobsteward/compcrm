import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectScopedDatabase } from "../database/database.constants";
import type { AssetActor } from "./asset-actor";
import { AssetCatalog } from "./asset-catalog.service";
import { appointmentProjectId, assetProjectId } from "./asset-context.service";
import { AssetFiles } from "./asset-files.service";
import type { AssetMetadataUpdateInput } from "./asset-metadata.contracts";
import { AssetMetadataService } from "./asset-metadata.service";
import { AssetMutations } from "./asset-mutation.service";
import { AssetStorageService } from "./asset-storage.service";
import { AssetTransfers } from "./asset-transfer.service";
import { AssetCreation } from "./asset-upload-create.service";
import type { AssetListInput, CreateAssetInput } from "./assets.contracts";

export type { AssetActor } from "./asset-actor";

@Injectable()
export class AssetsService {
	private readonly creation: AssetCreation;
	private readonly transfers: AssetTransfers;
	private readonly catalog: AssetCatalog;
	private readonly files: AssetFiles;
	private readonly metadata: AssetMetadataService;

	constructor(
		@InjectScopedDatabase() private readonly db: Db,
		storage: AssetStorageService,
	) {
		const mutations = new AssetMutations(db);
		this.creation = new AssetCreation(mutations, storage);
		this.transfers = new AssetTransfers(db, storage);
		this.catalog = new AssetCatalog(db, storage);
		this.files = new AssetFiles(mutations);
		this.metadata = new AssetMetadataService(mutations, storage);
	}

	async createProjectAsset(
		actor: AssetActor,
		projectId: string,
		raw: CreateAssetInput,
		key: string,
	) {
		return this.create(actor, projectId, raw, key);
	}

	async createAppointmentAsset(
		actor: AssetActor,
		appointmentId: string,
		raw: CreateAssetInput,
		key: string,
	) {
		const projectId = await appointmentProjectId(this.db, actor, appointmentId);
		return this.create(actor, projectId, raw, key, appointmentId);
	}

	private async create(
		actor: AssetActor,
		projectId: string,
		raw: CreateAssetInput,
		key: string,
		appointmentId?: string,
	) {
		const { assetId } = await this.creation.createAsset(
			actor,
			projectId,
			raw,
			key,
			appointmentId,
		);
		const transfer = await this.transfers.issue(actor, projectId, assetId);
		return { ...(await this.catalog.getAsset(actor, assetId)), transfer };
	}

	listProjectAssets(actor: AssetActor, projectId: string, raw: AssetListInput) {
		return this.catalog.listProjectAssets(actor, projectId, raw);
	}

	async listAppointmentAssets(
		actor: AssetActor,
		appointmentId: string,
		raw: AssetListInput,
	) {
		const projectId = await appointmentProjectId(this.db, actor, appointmentId);
		return this.catalog.listProjectAssets(actor, projectId, raw, appointmentId);
	}

	getAsset(actor: AssetActor, assetId: string) {
		return this.catalog.getAsset(actor, assetId);
	}

	async updateAsset(
		actor: AssetActor,
		assetId: string,
		raw: AssetMetadataUpdateInput,
		key: string,
	) {
		const projectId = await assetProjectId(this.db, actor, assetId);
		await this.metadata.updateAsset(actor, projectId, assetId, raw, key);
		return this.catalog.getAsset(actor, assetId);
	}

	async deleteAsset(actor: AssetActor, assetId: string, key: string) {
		const projectId = await assetProjectId(this.db, actor, assetId);
		return this.files.deleteAsset(actor, projectId, assetId, key);
	}
}
