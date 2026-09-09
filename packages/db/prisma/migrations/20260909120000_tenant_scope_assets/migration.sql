ALTER TABLE "artifact" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "assetUpload" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "assetEmailSource" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "assetStorageJob" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "assetApiRequest" ADD COLUMN "organizationId" TEXT;

UPDATE "artifact"
SET "organizationId" = "deal"."organizationId"
FROM "deal"
WHERE "artifact"."dealId" = "deal"."id";

UPDATE "assetUpload"
SET "organizationId" = "deal"."organizationId"
FROM "deal"
WHERE "assetUpload"."projectId" = "deal"."id";

UPDATE "assetEmailSource"
SET "organizationId" = "deal"."organizationId"
FROM "deal"
WHERE "assetEmailSource"."projectId" = "deal"."id";

UPDATE "assetStorageJob"
SET "organizationId" = "deal"."organizationId"
FROM "deal"
WHERE "assetStorageJob"."projectId" = "deal"."id";

UPDATE "assetApiRequest"
SET "organizationId" = "deal"."organizationId"
FROM "deal"
WHERE "deal"."id" = substring("assetApiRequest"."path" FROM '^/projects/([^/]+)');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "artifact" WHERE "organizationId" IS NULL
    UNION ALL
    SELECT 1 FROM "assetUpload" WHERE "organizationId" IS NULL
    UNION ALL
    SELECT 1 FROM "assetEmailSource" WHERE "organizationId" IS NULL
    UNION ALL
    SELECT 1 FROM "assetStorageJob" WHERE "organizationId" IS NULL
    UNION ALL
    SELECT 1 FROM "assetApiRequest" WHERE "organizationId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Asset tenant backfill failed';
  END IF;
END $$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'artifact',
    'assetUpload',
    'assetEmailSource',
    'assetStorageJob',
    'assetApiRequest'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "organizationId" SET NOT NULL', tbl);
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN "organizationId" SET DEFAULT current_setting(''app.current_organization_id''::text, true)',
      tbl
    );
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE',
      tbl,
      tbl || '_organizationId_fkey'
    );
    EXECUTE format('CREATE INDEX %I ON %I ("organizationId")', tbl || '_organizationId_idx', tbl);
    EXECUTE format(
      'CREATE POLICY "tenantIsolation" ON %I USING ("organizationId" = current_setting(''app.current_organization_id''::text, true)) WITH CHECK ("organizationId" = current_setting(''app.current_organization_id''::text, true))',
      tbl
    );
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;
