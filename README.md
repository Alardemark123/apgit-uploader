# APGIT GCS Uploader

Multi-site file uploader for Google Cloud Storage. One shared bucket; objects are stored under site/folder paths. Site configuration is persisted in GCS and seeded locally for first run / fallback.

## Architecture

- **1 bucket** for all sites
- **Object paths:** `{site}/{folder}/{optional-subfolder}/{filename}`
- **Config:** `config/sites.json` in the same GCS bucket (authoritative at runtime)
- **Seed fallback:** `data/sites.seed.json` when GCS config is missing
- **Auth:** shared password sets httpOnly cookie `uploader_session` (middleware allows `/login` and `/api/auth/*`)
- **Uploads:** browser requests a short-lived signed PUT URL, then uploads directly to GCS (avoids Vercel `FUNCTION_PAYLOAD_TOO_LARGE` / 413 limits on large videos)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template and fill in values:

```bash
cp .env.example .env.local
```

3. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3002](http://localhost:3002). You will be redirected to `/login` until authenticated.

## Environment variables

| Variable | Description |
|----------|-------------|
| `GCS_BUCKET` | Shared GCS bucket name |
| `GCS_BUCKET_LOCATION` | Optional GCP region for bucket creation (default: `asia-southeast1`) |
| `GCS_PROJECT_ID` | GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Full service-account JSON as a string (used on Vercel / serverless) |
| `UPLOADER_PASSWORD` | Shared password for the uploader login gate |
| `PUBLIC_ASSET_BASE_URL` | Public base URL for uploaded assets (CDN or `https://storage.googleapis.com/<bucket>`) |
| `UPLOAD_CORS_ORIGINS` | Optional comma-separated origins allowed for browser PUT to GCS (default `*`) |

Local tip: you can also point `GOOGLE_APPLICATION_CREDENTIALS` at a key file on disk for local ADC; production should prefer the JSON env var.

### Service account permissions

The service account needs at least:

- `storage.buckets.get` — check bucket exists
- `storage.buckets.create` — create bucket from the dashboard setup flow
- Object read/write on the bucket — uploads, config, and file browsing

If bucket creation fails with permission errors, grant **Storage Admin** on the project or the specific bucket resource, or create the bucket manually in GCP Console and skip the in-app setup step.

### Bucket setup (first run)

If `GCS_BUCKET` does not exist yet, the dashboard shows a setup banner after login:

1. Click **Create bucket** — calls `POST /api/setup/bucket`
2. The app creates the bucket in `GCS_BUCKET_LOCATION` with **uniform bucket-level access**
3. Public read is configured via IAM: `allUsers` → `roles/storage.objectViewer` (marketing assets are world-readable)
4. `config/sites.json` is seeded from `data/sites.seed.json` when missing

Uploaded objects use `cacheControl: public, max-age=31536000`. Public URLs work via bucket IAM (not per-object ACLs), which is compatible with uniform bucket-level access.

If your org blocks `allUsers` IAM bindings, bucket creation still succeeds but public URLs may not work until you configure access manually (e.g. Cloud CDN, signed URLs, or a restricted IAM policy).

## API overview

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/login` | — | `{ password }` → sets `uploader_session` |
| POST | `/api/auth/logout` | — | Clears cookie |
| GET | `/api/auth/me` | — | `{ ok, authenticated }` |
| GET / POST | `/api/setup/bucket` | required | Check / create GCS bucket and seed config |
| GET / POST | `/api/sites` | required | List / add site |
| POST | `/api/sites/[siteId]/folders` | required | Add folder |
| POST | `/api/upload` | required | multipart: `site`, `folder`, optional `subfolder`, `files` |
| GET / DELETE | `/api/files` | required | List by `site`+`folder`; delete by `path` |

## How adding a website / folder works

Sites and folders are defined in config shaped as:

```json
{
  "sites": [
    {
      "id": "detoxicare",
      "label": "Detoxicare",
      "folders": ["articles", "products", "images", "logo", "heroes", "misc"]
    }
  ]
}
```

- **Add a site:** create an entry with a slug-safe `id`, human `label`, and `folders` list.
- **Add a folder:** append a slug-safe name to that site’s `folders` array.
- **Persist:** live config is written to GCS at **`config/sites.json`**. The app loads from GCS first and falls back to `data/sites.seed.json` when the object does not exist yet.
- Uploads land at `{siteId}/{folder}/{optionalSubfolder}/{filename}` under `GCS_BUCKET`.

## Vercel deploy

1. Create a Vercel project from this repo.
2. Set the env vars above in the Vercel project settings (Production + Preview as needed).
3. Ensure the service account in `GOOGLE_APPLICATION_CREDENTIALS_JSON` can create/read/write the bucket (see **Service account permissions** above). On first deploy, use the dashboard **Create bucket** flow or pre-create the bucket in GCP.
4. Deploy. No special build command is required beyond `next build` / `next start` (Vercel defaults).

## Scripts

- `npm run dev` — development
- `npm run build` — production build
- `npm start` — run production server
- `npm run lint` — ESLint
