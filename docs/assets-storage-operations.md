# Asset storage operations

CompCRM uses a private Cloudflare R2 bucket for project assets. The API signs short-lived direct transfers. The API never returns R2 credentials to a client.

Set these variables together in the root `.env`:

| Variable | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account ID that owns the bucket. |
| `R2_ACCESS_KEY_ID` | R2 API token access key with object read and write access. |
| `R2_SECRET_ACCESS_KEY` | Secret for the R2 API token. |
| `R2_BUCKET` | Private bucket name. |

All four variables are optional. When a value is missing, the API still starts. New asset creation returns `503 STORAGE_UNAVAILABLE`. The worker retains queued storage work without processing it. Asset metadata reads remain available with no download URL. Do not place these values in a package-local `.env` file.

Create one private bucket for the deployment. Keep public access disabled. New temporary objects use the `temporary/` prefix. Final objects stay outside that prefix.

For organization `org_123` and project `project_456`, new keys have this structure:

```text
temporary/org_123/projects/project_456/upload_abc
org_123/projects/project_456/assets/object_789
```

The final object ID is independent of the internal upload and asset IDs. File names, content types, and appointment references stay in database metadata. Renaming a file or project does not change its key.

Existing assets keep their stored bucket and keys. Finalization, signed downloads, and deletion use those stored locations. The API never reconstructs an existing key from a file name.

Configure an R2 lifecycle rule for `temporary/` with a seven-day expiration. This rule removes abandoned temporary objects, including late writes through an expired transfer. Application cleanup also attempts deletion and records durable work. Lifecycle deletion is eventual. See [R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

Configure bucket CORS for every approved origin that performs direct transfers. A starting policy is:

```json
[
  {
    "AllowedOrigins": ["https://app.jobsteward.ai"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace the origin with every approved web origin. Add a local origin only for local development. Do not use `*` for a production bucket.

## Implemented storage flow

1. `POST /projects/{projectId}/assets` or `POST /appointments/{appointmentId}/assets` stores JSON metadata, creates an `UNVERIFIED` asset, and returns a signed `PUT` transfer.
2. The client sends the original bytes to R2 with the returned `Content-Type` and `Content-Length` headers.
3. `PATCH /assets/{assetId}` with `{ "uploadCompleted": true }` records completion and queues durable verification work. The request does not upload bytes and does not make the asset ready.
4. The worker reads temporary-object size and ETag, performs an ETag-conditional copy to the final key, verifies the final object, and changes the asset to `READY`.
5. `GET /assets/{assetId}` returns a temporary signed GET only for a `READY` asset. The download grant lasts 15 minutes.
6. `DELETE /assets/{assetId}` changes the asset to `DELETING` and queues durable object deletion. The worker changes it to `DELETED` after storage confirms removal.

The public API has no upload ID route, confirmation route, URL renewal route, cancellation route, or separate download route. A retry of the original POST with the same request body and `Idempotency-Key` returns the same asset and refreshes its transfer while the internal upload remains pending. No public transfer-renewal operation exists.

The direct `PUT` uses no CRM credential. The API signs `Content-Type` and `Content-Length`. The maximum single request is `5363466240` bytes. This is a transport limit. The API accepts any file format and has no recording-duration limit.

The transfer URL lifetime is 15 minutes or the internal 24-hour upload-intent deadline, whichever comes first. URL lifetime does not prove a maximum duration for a PUT that has already started. Verify this provider behavior against real R2.

## Durable worker behavior

`AssetUpload` stores expected metadata, temporary and final keys, transfer and intent deadlines, source ETag, and internal upload status. `AssetStorageJob` stores `FINALIZE_UPLOAD` and `DELETE_OBJECT` work. These tables are storage internals. They have no public asset routes.

The internal `GET /internal/assets/process` route requires `Authorization: Bearer <CRON_SECRET>` and processes bounded work. The deployment schedules it once per minute.

The R2 client uses one SDK attempt per request, a five-second connection timeout, and a 30-second request timeout. Durable worker retries use exponential backoff from five seconds up to one hour. Finalization stops after five attempts or 24 hours after completion was requested. It records a verification or finalization failure while the public asset remains `UNVERIFIED`.

Deletion retries continue until R2 confirms that the object is absent. Completed deletion jobs run reconciliation hourly. A late temporary write or a copied final object receives another deletion attempt.

The actor capacity limit is 20 retained temporary-upload reservations. Cleanup retains reservations for seven days after the latest transfer authorization expires and releases them only after it verifies object removal. This interval is a cleanup policy, not a verified R2 transfer deadline. Temporary cleanup continues after reservation release.

Existing unverified artifacts retain their stored locations. Confirm the bucket, key, byte count, and media type before marking a row `READY`. Deleting an artifact with an unknown bucket creates durable work that requires operator resolution. Resolve the bucket from verified storage evidence. Never assign the configured bucket solely because its key matches.

## Release checks against real R2

Fake storage tests prove request construction. They do not prove R2 behavior. Run these checks after credentials, bucket privacy, and CORS are configured:

1. Create assets at zero bytes and at `5363466240` bytes. Confirm the signed transfer carries the exact content type and length.
2. Confirm `5363466241` bytes returns `413 UPLOAD_TOO_LARGE` before a new asset is created.
3. Send a direct PUT with the returned headers. Repeat with a different content type, shorter body, longer body, and unknown-length body. Confirm invalid transfers do not become ready assets.
4. Start a PUT before transfer expiry and finish after expiry. Record the provider result. Do not claim URL expiry limits transfer duration without this evidence.
5. Repeat the original POST with the same key after transfer expiry. Confirm it returns the same asset and a fresh transfer while the intent remains valid.
6. Send `PATCH /assets/{assetId}` with `uploadCompleted: true`. Confirm the asset remains `UNVERIFIED` until the worker verifies the object, then becomes `READY`.
7. Change the temporary object's ETag after the worker records it and before copy. Confirm conditional copy fails and no ready asset is created.
8. Delete a ready asset. Confirm the public state changes to `DELETING`, then `DELETED` only after R2 confirms removal. Test a transient storage failure and a later retry.
9. Confirm the final key cannot be written with the temporary PUT grant. Confirm signed GET responses use attachment disposition and support range requests.
10. Verify an unauthenticated request cannot read a final object from the private bucket.

Record the date, bucket, region `auto`, SDK version, test object keys, and R2 responses. Remove test objects after verification. Do not include credentials or signed URLs in release evidence.

Use the [R2 presigned URL documentation](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/), and [R2 upload limits](https://developers.cloudflare.com/r2/platform/limits/) as release references.
