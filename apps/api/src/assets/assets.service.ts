import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectScopedDatabase } from "../database/database.constants";
import { type AssetActor, assetActorKey } from "./asset-actor";
import { AssetCatalog } from "./asset-catalog.service";
import { AssetFiles } from "./asset-files.service";
import type { AssetMetadataUpdateInput } from "./asset-metadata.contracts";
import { AssetMetadataService } from "./asset-metadata.service";
import { AssetMutations } from "./asset-mutation.service";
import { uploadResponse } from "./asset-responses";
import { AssetStorageService } from "./asset-storage.service";
import { AssetUploadCreation } from "./asset-upload-create.service";
import { AssetUploads } from "./asset-uploads.service";
import type { AssetListInput, CreateUploadInput } from "./assets.contracts";

export { type AssetActor, assetActorKey, uploadResponse };

@Injectable()
export class AssetsService {
	private readonly creation: AssetUploadCreation;
	private readonly uploads: AssetUploads;
	private readonly catalog: AssetCatalog;
	private readonly files: AssetFiles;
	private readonly metadata: AssetMetadataService;

	constructor(@InjectScopedDatabase() db: Db, storage: AssetStorageService) {
		const mutations = new AssetMutations(db);
		this.creation = new AssetUploadCreation(mutations, storage);
		this.uploads = new AssetUploads(db, storage, mutations);
		this.catalog = new AssetCatalog(db);
		this.files = new AssetFiles(db, storage, mutations);
		this.metadata = new AssetMetadataService(mutations);
	}

	async createUpload(
		actor: AssetActor,
		projectId: string,
		raw: CreateUploadInput,
		key: string,
	) {
		return this.creation.createUpload(actor, projectId, raw, key);
	}

	async getUpload(actor: AssetActor, projectId: string, uploadId: string) {
		return this.uploads.getUpload(actor, projectId, uploadId);
	}

	async renewUpload(
		actor: AssetActor,
		projectId: string,
		uploadId: string,
		key: string,
	) {
		return this.uploads.renewUpload(actor, projectId, uploadId, key);
	}

	async confirmUpload(
		actor: AssetActor,
		projectId: string,
		uploadId: string,
		key: string,
	) {
		return this.uploads.confirmUpload(actor, projectId, uploadId, key);
	}

	async cancelUpload(
		actor: AssetActor,
		projectId: string,
		uploadId: string,
		key: string,
	) {
		return this.uploads.cancelUpload(actor, projectId, uploadId, key);
	}

	async listCustomerAssets(
		actor: AssetActor,
		customerId: string,
		raw: AssetListInput,
	) {
		return this.catalog.listCustomerAssets(actor, customerId, raw);
	}

	async listProjectAssets(
		actor: AssetActor,
		projectId: string,
		raw: AssetListInput,
	) {
		return this.catalog.listProjectAssets(actor, projectId, raw);
	}

	async getAsset(actor: AssetActor, projectId: string, assetId: string) {
		return this.catalog.getAsset(actor, projectId, assetId);
	}

	async updateAsset(
		actor: AssetActor,
		projectId: string,
		assetId: string,
		raw: AssetMetadataUpdateInput,
		key: string,
	) {
		return this.metadata.updateAsset(actor, projectId, assetId, raw, key);
	}

	async downloadAsset(actor: AssetActor, projectId: string, assetId: string) {
		return this.files.downloadAsset(actor, projectId, assetId);
	}

	async deleteAsset(
		actor: AssetActor,
		projectId: string,
		assetId: string,
		key: string,
	) {
		return this.files.deleteAsset(actor, projectId, assetId, key);
	}
}
