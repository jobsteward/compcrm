import { ConfigService } from "@nestjs/config";
import type { AssetStorageHead } from "../src/assets/asset-storage.service";
import { AssetStorageService } from "../src/assets/asset-storage.service";

export class MemoryStorage extends AssetStorageService {
	objects = new Map<string, AssetStorageHead>();
	copyCount = 0;
	deleteFailures = 0;
	copyFailures = 0;
	copyTimeout = false;
	enabled = true;
	copyHook: ((signal?: AbortSignal) => Promise<void>) | null = null;
	headHook: ((signal?: AbortSignal) => Promise<void>) | null = null;
	constructor() {
		super(
			new ConfigService({
				R2_ACCOUNT_ID: "test",
				R2_ACCESS_KEY_ID: "test",
				R2_SECRET_ACCESS_KEY: "test",
				R2_BUCKET: "test",
			}),
		);
	}
	override configured() {
		return this.enabled !== false;
	}
	override bucket() {
		return "test";
	}
	override async presignPut(
		_bucket: string,
		key: string,
		_type: string,
		_size: number,
		expires: Date,
	) {
		return `https://storage.test/${key}?expires=${expires.getTime()}`;
	}
	override async presignGet(_bucket: string, key: string) {
		return `https://storage.test/${key}`;
	}
	override async head(_bucket: string, key: string, signal?: AbortSignal) {
		signal?.throwIfAborted();
		if (this.headHook) await this.headHook(signal);
		signal?.throwIfAborted();
		return this.objects.get(key) ?? null;
	}
	override async copy(
		_bucket: string,
		sourceKey: string,
		finalKey: string,
		sourceEtag: string,
		signal?: AbortSignal,
	) {
		signal?.throwIfAborted();
		this.copyCount++;
		if (this.copyFailures > 0) {
			this.copyFailures--;
			throw new Error("Transient copy failure");
		}
		if (this.copyHook) await this.copyHook(signal);
		signal?.throwIfAborted();
		const source = this.objects.get(sourceKey);
		if (!source || source.etag !== sourceEtag)
			throw new Error("Precondition failed");
		this.objects.set(finalKey, { ...source });
		if (this.copyTimeout) {
			this.copyTimeout = false;
			throw new Error("Unknown copy result");
		}
	}
	override async delete(_bucket: string, key: string) {
		if (this.deleteFailures > 0) {
			this.deleteFailures--;
			throw new Error("Transient delete failure");
		}
		this.objects.delete(key);
	}
	put(key: string, sizeBytes = 4, etag = '"source-1"') {
		this.objects.set(key, {
			sizeBytes,
			etag,
			contentType: "arbitrary/example",
		});
	}
}
