import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { AppointmentsRouter } from "./appointments.router";
import { AppointmentsService } from "./appointments.service";

@Module({
	imports: [TrpcModule],
	providers: [AppointmentsRouter, AppointmentsService],
	exports: [AppointmentsService],
})
export class AppointmentsModule {}
