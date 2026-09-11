import { API_KEY_HEADER, apiUrl, OAUTH, SESSION_COOKIE_NAME } from "@crm/auth";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
	ExpressAdapter,
	type NestExpressApplication,
} from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { AppRouterHost } from "nestjs-trpc";
import {
	createOpenApiNodeHttpHandler,
	generateOpenApiDocument,
} from "trpc-to-openapi";
import { AppModule } from "./app.module";
import { describeAssetErrors } from "./assets/asset-openapi";
import {
	prepareAssetRestResponse,
	recordAssetRestError,
	validateAssetRestRequest,
} from "./assets/asset-rest";
import { RequestPrincipalService } from "./auth/request-principal.service";
import { ContextLogger } from "./logging/context-logger";
import { createBaseTrpcContext } from "./trpc/trpc.context";

export async function createApp(): Promise<NestExpressApplication> {
	const app = await NestFactory.create<NestExpressApplication>(
		AppModule,
		new ExpressAdapter(),
		{ bodyParser: false, logger: new ContextLogger() },
	);

	app.use(helmet());
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		}),
	);

	let restBridge:
		| ((req: Request, res: Response, next: NextFunction) => Promise<void>)
		| undefined;
	app.use((req: Request, res: Response, next: NextFunction) => {
		if (!restBridge) return next();
		prepareAssetRestResponse(req, res);
		void restBridge(req, res, next);
	});

	const apiKeySecurityScheme = {
		type: "apiKey",
		in: "header",
		name: API_KEY_HEADER,
	} as const;
	const oauthSecurityScheme = {
		type: "http",
		scheme: "bearer",
		bearerFormat: "JWT",
		description: `CompCRM OAuth access token with ${OAUTH.scopes.crm.read} or ${OAUTH.scopes.crm.write} scope.`,
	} as const;

	// SwaggerModule.setup() registers its Express routes synchronously, so it must
	// happen before app.init() the same way the REST bridge does — Nest's own
	// routing (wired up during init) otherwise shadows anything registered after
	// it. The factory form defers building the document (which needs the tRPC
	// router, only available post-init) to first request instead.
	SwaggerModule.setup(
		"",
		app,
		() => {
			const { appRouter } = app.get(AppRouterHost);

			const trpcDocument = generateOpenApiDocument(appRouter, {
				title: "CRM API — tRPC bridge",
				description:
					"Every tRPC procedure, reachable over REST for tooling that cannot speak tRPC. Same validation, same middlewares, same services as the tRPC transport — this only translates the wire format.",
				version: "1.0",
				baseUrl: apiUrl,
				securitySchemes: {
					apiKey: apiKeySecurityScheme,
					oauth: oauthSecurityScheme,
				},
			});
			describeAssetErrors(trpcDocument);

			const swaggerConfig = new DocumentBuilder()
				.setTitle("CRM API")
				.setDescription(
					"REST surface of the CRM API: auth, health, internal cron routes, and tRPC procedures at root resource paths.",
				)
				.setVersion("1.0")
				.addCookieAuth(SESSION_COOKIE_NAME)
				.addApiKey(apiKeySecurityScheme, "apiKey")
				.addBearerAuth(oauthSecurityScheme, "oauth")
				.build();
			const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
			for (const path of Object.values(trpcDocument.paths ?? {})) {
				for (const method of [
					"get",
					"post",
					"put",
					"patch",
					"delete",
				] as const) {
					const operation = path[method];
					if (!operation?.security?.length) continue;
					operation.security = [{ cookie: [] }, { apiKey: [] }, { oauth: [] }];
				}
			}

			swaggerDocument.paths = {
				...swaggerDocument.paths,
				...(trpcDocument.paths as typeof swaggerDocument.paths),
			};
			swaggerDocument.servers = [{ url: apiUrl }];
			swaggerDocument.components = {
				...swaggerDocument.components,
				securitySchemes: {
					...swaggerDocument.components?.securitySchemes,
					...trpcDocument.components?.securitySchemes,
				},
				schemas: {
					...swaggerDocument.components?.schemas,
					...(trpcDocument.components?.schemas as NonNullable<
						typeof swaggerDocument.components
					>["schemas"]),
				},
			};

			return swaggerDocument;
		},
		{ jsonDocumentUrl: "openapi.json" },
	);

	await app.init();

	const { appRouter } = app.get(AppRouterHost);
	const principals = app.get(RequestPrincipalService);

	restBridge = createOpenApiNodeHttpHandler({
		router: appRouter,
		createContext: async ({ req }) => {
			const context = await createBaseTrpcContext(req, principals);
			validateAssetRestRequest(req);
			return context;
		},
		onError: ({ req, error }) => recordAssetRestError(req, error),
	});

	return app;
}
