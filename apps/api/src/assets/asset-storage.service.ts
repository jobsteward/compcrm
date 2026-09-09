import { S3Client } from "@aws-sdk/client-s3";
import { Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";
import { AssetError } from "./asset-error";
import {
	createR2Client,
	isR2Configured,
	type R2Config,
	readR2Config,
	requireBucketName,
	requireStorageClient,
} from "./asset-storage-client";
import {
	type AssetStorageHead,
	copyObject,
	deleteObject,
	headObject,
} from "./asset-storage-objects";
import { presignGetObject, presignPutObject } from "./asset-storage-signing";
import {
	expiresInSeconds,
	validateUploadSize,
} from "./asset-storage-validation";

export type { AssetStorageHead } from "./asset-storage-objects";

@Injectable()
export class AssetStorageService {
	private readonly r2: R2Config;
	private readonly client: S3Client | null;

	constructor(
		@Optional() config?: ConfigService<EnvironmentVariables, false>,
		@Optional() client?: S3Client,
	) {
		this.r2 = readR2Config(config);
		this.client = client ?? createR2Client(this.r2);
	}

	configured(): boolean {
		return isR2Configured(this.r2);
	}

	bucket(): string {
		if (!this.r2.bucket) {
			throw new AssetError(
				503,
				"STORAGE_UNAVAILABLE",
				"Object storage is not configured.",
				undefined,
				false,
			);
		}

		return this.r2.bucket;
	}

	async presignPut(
		bucket: string,
		key: string,
		contentType: string,
		sizeBytes: number,
		expiresAt: Date,
	): Promise<string> {
		validateUploadSize(sizeBytes);
		const expiresIn = expiresInSeconds(expiresAt);
		const client = this.requireClient();
		requireBucketName(bucket);
		return presignPutObject(
			client,
			bucket,
			key,
			contentType,
			sizeBytes,
			expiresIn,
		);
	}

	async presignGet(
		bucket: string,
		key: string,
		fileName: string,
		contentType: string,
		expiresAt: Date,
	): Promise<string> {
		const expiresIn = expiresInSeconds(expiresAt);
		const client = this.requireClient();
		requireBucketName(bucket);
		return presignGetObject(
			client,
			bucket,
			key,
			fileName,
			contentType,
			expiresIn,
		);
	}

	async head(
		bucket: string,
		key: string,
		signal?: AbortSignal,
	): Promise<AssetStorageHead | null> {
		const client = this.requireClient();
		requireBucketName(bucket);
		return headObject(client, bucket, key, signal);
	}

	async copy(
		bucket: string,
		sourceKey: string,
		finalKey: string,
		sourceEtag: string,
		signal?: AbortSignal,
	): Promise<void> {
		const client = this.requireClient();
		requireBucketName(bucket);
		return copyObject(client, bucket, sourceKey, finalKey, sourceEtag, signal);
	}

	async delete(
		bucket: string,
		key: string,
		signal?: AbortSignal,
	): Promise<void> {
		const client = this.requireClient();
		requireBucketName(bucket);
		return deleteObject(client, bucket, key, signal);
	}

	private requireClient(): S3Client {
		return requireStorageClient(this.client, this.configured());
	}
}
