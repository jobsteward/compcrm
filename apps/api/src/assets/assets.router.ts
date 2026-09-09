import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { assetRoutes } from "./asset-openapi";
import { assetUser, idempotencyKey } from "./asset-request";
import {
	assetDeletionSchema,
	assetDetailSchema,
	assetDownloadSchema,
	assetListSchema,
	customerAssetListArgs,
	projectAssetInput,
	projectAssetListInput,
	projectUploadCreateInput,
	projectUploadInput,
	uploadCancellationSchema,
	uploadConfirmationSchema,
	uploadGrantSchema,
	uploadStateSchema,
} from "./assets.contracts";
import { AssetsService } from "./assets.service";

@Router({ alias: "assets" })
@UseMiddlewares(AuthMiddleware)
export class AssetsRouter {
	constructor(@Inject(AssetsService) private readonly assets: AssetsService) {}

	@Mutation({
		input: projectUploadCreateInput,
		output: uploadGrantSchema,
		meta: assetRoutes.createUpload,
	})
	createUpload(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectUploadCreateInput>,
	) {
		const { projectId, ...body } = input;
		return this.assets.createUpload(
			assetUser(ctx),
			projectId,
			body,
			idempotencyKey(ctx),
		);
	}

	@Query({
		input: projectUploadInput,
		output: uploadStateSchema,
		meta: assetRoutes.getUpload,
	})
	getUpload(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectUploadInput>,
	) {
		return this.assets.getUpload(
			assetUser(ctx),
			input.projectId,
			input.uploadId,
		);
	}

	@Mutation({
		input: projectUploadInput,
		output: uploadGrantSchema,
		meta: assetRoutes.renewUpload,
	})
	renewUpload(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectUploadInput>,
	) {
		return this.assets.renewUpload(
			assetUser(ctx),
			input.projectId,
			input.uploadId,
			idempotencyKey(ctx),
		);
	}

	@Mutation({
		input: projectUploadInput,
		output: uploadConfirmationSchema,
		meta: assetRoutes.confirmUpload,
	})
	confirmUpload(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectUploadInput>,
	) {
		return this.assets.confirmUpload(
			assetUser(ctx),
			input.projectId,
			input.uploadId,
			idempotencyKey(ctx),
		);
	}

	@Mutation({
		input: projectUploadInput,
		output: uploadCancellationSchema,
		meta: assetRoutes.cancelUpload,
	})
	cancelUpload(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectUploadInput>,
	) {
		return this.assets.cancelUpload(
			assetUser(ctx),
			input.projectId,
			input.uploadId,
			idempotencyKey(ctx),
		);
	}

	@Query({
		input: customerAssetListArgs,
		output: assetListSchema,
		meta: assetRoutes.listCustomerAssets,
	})
	listCustomerAssets(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof customerAssetListArgs>,
	) {
		const { customerId, ...query } = input;
		return this.assets.listCustomerAssets(assetUser(ctx), customerId, query);
	}

	@Query({
		input: projectAssetListInput,
		output: assetListSchema,
		meta: assetRoutes.listProjectAssets,
	})
	listProjectAssets(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectAssetListInput>,
	) {
		const { projectId, ...query } = input;
		return this.assets.listProjectAssets(assetUser(ctx), projectId, query);
	}

	@Query({
		input: projectAssetInput,
		output: assetDetailSchema,
		meta: assetRoutes.getAsset,
	})
	getAsset(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectAssetInput>,
	) {
		return this.assets.getAsset(assetUser(ctx), input.projectId, input.assetId);
	}

	@Query({
		input: projectAssetInput,
		output: assetDownloadSchema,
		meta: assetRoutes.downloadAsset,
	})
	downloadAsset(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectAssetInput>,
	) {
		return this.assets.downloadAsset(
			assetUser(ctx),
			input.projectId,
			input.assetId,
		);
	}

	@Mutation({
		input: projectAssetInput,
		output: assetDeletionSchema,
		meta: assetRoutes.deleteAsset,
	})
	deleteAsset(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectAssetInput>,
	) {
		return this.assets.deleteAsset(
			assetUser(ctx),
			input.projectId,
			input.assetId,
			idempotencyKey(ctx),
		);
	}
}
