CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED');

ALTER TABLE "activity" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "activity_archivedAt_idx" ON "activity"("archivedAt");

CREATE TABLE "appointmentDetails" (
  "activityId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT current_setting('app.current_organization_id'::text, true),
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "timeZone" TEXT NOT NULL,
  "location" TEXT,
  "ownerId" TEXT NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "appointmentDetails_pkey" PRIMARY KEY ("activityId"),
  CONSTRAINT "appointmentDetails_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "appointmentDetails_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "appointmentDetails_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "appointmentDetails_organizationId_startsAt_activityId_idx" ON "appointmentDetails"("organizationId", "startsAt", "activityId");
CREATE POLICY tenant_isolation ON "appointmentDetails"
  USING ("organizationId" = current_setting('app.current_organization_id'::text, true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id'::text, true));
ALTER TABLE "appointmentDetails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointmentDetails" FORCE ROW LEVEL SECURITY;

ALTER TABLE "artifact" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "artifact" ADD COLUMN "updatedAt" TIMESTAMP(3);
DO $$
DECLARE tenant_id TEXT;
BEGIN
  FOR tenant_id IN SELECT "id" FROM "organization" LOOP
    PERFORM set_config('app.current_organization_id', tenant_id, true);
    UPDATE "artifact" SET "updatedAt" = "createdAt";
  END LOOP;
END $$;
ALTER TABLE "artifact" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "artifact" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "artifact_dealId_activityId_status_createdAt_id_idx" ON "artifact"("dealId", "activityId", "status", "createdAt", "id");
