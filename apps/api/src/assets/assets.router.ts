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
import { assetUpdateInput } from "./asset-metadata.contracts";
import { assetRoutes } from "./asset-openapi";
import { assetUser, idempotencyKey } from "./asset-request";
import {
	appointmentAssetCreateInput,
	appointmentAssetListInput,
	assetCreationSchema,
	assetDeletionSchema,
	assetDetailSchema,
	assetListSchema,
	assetMemberInput,
	projectAssetCreateInput,
	projectAssetListInput,
} from "./assets.contracts";
import { AssetsService } from "./assets.service";

@Router({ alias: "assets" })
@UseMiddlewares(AuthMiddleware)
export class AssetsRouter {
	constructor(@Inject(AssetsService) private readonly assets: AssetsService) {}

	@Mutation({
		input: projectAssetCreateInput,
		output: assetCreationSchema,
		meta: assetRoutes.createProjectAsset,
	})
	createProjectAsset(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof projectAssetCreateInput>,
	) {
		const { projectId, ...body } = input;
		return this.assets.createProjectAsset(
			assetUser(ctx),
			projectId,
			body,
			idempotencyKey(ctx),
		);
	}

	@Mutation({
		input: appointmentAssetCreateInput,
		output: assetCreationSchema,
		meta: assetRoutes.createAppointmentAsset,
	})
	createAppointmentAsset(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof appointmentAssetCreateInput>,
	) {
		const { appointmentId, ...body } = input;
		return this.assets.createAppointmentAsset(
			assetUser(ctx),
			appointmentId,
			body,
			idempotencyKey(ctx),
		);
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
		input: appointmentAssetListInput,
		output: assetListSchema,
		meta: assetRoutes.listAppointmentAssets,
	})
	listAppointmentAssets(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof appointmentAssetListInput>,
	) {
		const { appointmentId, ...query } = input;
		return this.assets.listAppointmentAssets(
			assetUser(ctx),
			appointmentId,
			query,
		);
	}

	@Query({
		input: assetMemberInput,
		output: assetDetailSchema,
		meta: assetRoutes.getAsset,
	})
	getAsset(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof assetMemberInput>,
	) {
		return this.assets.getAsset(assetUser(ctx), input.assetId);
	}

	@Mutation({
		input: assetUpdateInput,
		output: assetDetailSchema,
		meta: assetRoutes.updateAsset,
	})
	updateAsset(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof assetUpdateInput>,
	) {
		const { assetId, ...body } = input;
		return this.assets.updateAsset(
			assetUser(ctx),
			assetId,
			body,
			idempotencyKey(ctx),
		);
	}

	@Mutation({
		input: assetMemberInput,
		output: assetDeletionSchema,
		meta: assetRoutes.deleteAsset,
	})
	deleteAsset(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof assetMemberInput>,
	) {
		return this.assets.deleteAsset(
			assetUser(ctx),
			input.assetId,
			idempotencyKey(ctx),
		);
	}
}
