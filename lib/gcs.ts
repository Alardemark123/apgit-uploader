import { Storage, type Bucket } from "@google-cloud/storage";

let storage: Storage | null = null;
let bucket: Bucket | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getCredentials(): object | undefined {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as object;
  } catch {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON");
  }
}

export function getStorage(): Storage {
  if (storage) return storage;

  const credentials = getCredentials();
  const projectId = process.env.GCS_PROJECT_ID?.trim();

  storage = new Storage({
    ...(projectId ? { projectId } : {}),
    ...(credentials ? { credentials } : {}),
  });

  return storage;
}

export function getBucketName(): string {
  return requireEnv("GCS_BUCKET");
}

export function getBucketLocation(): string {
  return process.env.GCS_BUCKET_LOCATION?.trim() || "asia-southeast1";
}

/** Clear cached bucket handle (e.g. after creating the bucket). */
export function resetBucketCache(): void {
  bucket = null;
}

export function getBucket(): Bucket {
  if (bucket) return bucket;

  bucket = getStorage().bucket(getBucketName());
  return bucket;
}

function errorCode(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
}

function gcsErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;

  const code = errorCode(err);
  const message = err.message || fallback;

  if (code === 403 || /permission|denied|forbidden/i.test(message)) {
    return (
      "Permission denied creating or accessing the bucket. Ensure the service account has " +
      "storage.buckets.create, storage.buckets.get, and object read/write permissions."
    );
  }

  if (code === 409 || /already exists|AlreadyExists/i.test(message)) {
    return "Bucket already exists.";
  }

  return message;
}

async function grantPublicObjectRead(target: Bucket): Promise<void> {
  const [policy] = await target.iam.getPolicy({ requestedPolicyVersion: 3 });
  const bindings = policy.bindings ?? [];
  const role = "roles/storage.objectViewer";
  const member = "allUsers";

  const existing = bindings.find((b) => b.role === role);
  if (existing) {
    if (!existing.members?.includes(member)) {
      existing.members = [...(existing.members ?? []), member];
    }
  } else {
    bindings.push({ role, members: [member] });
  }

  policy.bindings = bindings;
  await target.iam.setPolicy(policy);
}

/** Check whether the configured GCS bucket exists. */
export async function bucketExists(): Promise<boolean> {
  const [exists] = await getStorage().bucket(getBucketName()).exists();
  return exists;
}

/**
 * Create the configured bucket with uniform bucket-level access and public object read (IAM).
 * Idempotent when the bucket already exists.
 */
export async function createBucket(): Promise<{
  created: boolean;
  publicReadConfigured: boolean;
  warning?: string;
}> {
  const bucketName = getBucketName();
  const storage = getStorage();
  const target = storage.bucket(bucketName);
  const [exists] = await target.exists();

  if (exists) {
    resetBucketCache();
    return { created: false, publicReadConfigured: true };
  }

  try {
    await storage.createBucket(bucketName, {
      location: getBucketLocation(),
      iamConfiguration: {
        uniformBucketLevelAccess: {
          enabled: true,
        },
      },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("AlreadyExists") || errorCode(err) === 409)
    ) {
      resetBucketCache();
      return { created: false, publicReadConfigured: true };
    }
    throw new Error(gcsErrorMessage(err, "Failed to create bucket"));
  }

  resetBucketCache();

  let publicReadConfigured = false;
  let warning: string | undefined;

  try {
    await grantPublicObjectRead(getBucket());
    publicReadConfigured = true;
  } catch (err) {
    warning =
      "Bucket was created but public read could not be configured (org policy may block allUsers). " +
      "Objects may not be publicly accessible until IAM is updated manually.";
    console.warn(warning, err);
  }

  return { created: true, publicReadConfigured, warning };
}

/** Ensure the bucket exists, creating it when missing. Use from setup flows only. */
export async function ensureBucket(): Promise<{
  created: boolean;
  exists: boolean;
  warning?: string;
}> {
  if (await bucketExists()) {
    return { created: false, exists: true };
  }

  const result = await createBucket();
  return {
    created: result.created,
    exists: true,
    warning: result.warning,
  };
}

/**
 * Resolve PUBLIC_ASSET_BASE_URL as a URL value only.
 * Strips wrapping quotes and an accidental `PUBLIC_ASSET_BASE_URL=` prefix
 * when the env key was pasted into the value (common .env typo).
 */
function resolvePublicAssetBaseUrl(): string {
  let base = (process.env.PUBLIC_ASSET_BASE_URL ?? "").trim();
  if (
    (base.startsWith('"') && base.endsWith('"')) ||
    (base.startsWith("'") && base.endsWith("'"))
  ) {
    base = base.slice(1, -1).trim();
  }
  const accidentalPrefix = "PUBLIC_ASSET_BASE_URL=";
  while (base.startsWith(accidentalPrefix)) {
    base = base.slice(accidentalPrefix.length).trim();
  }
  return base.replace(/\/+$/, "");
}

/** Build a public URL from PUBLIC_ASSET_BASE_URL + object path. */
export function publicUrl(objectPath: string): string {
  const base = resolvePublicAssetBaseUrl();
  const path = objectPath.replace(/^\/+/, "");
  if (!base) {
    const bucketName = process.env.GCS_BUCKET?.trim() ?? "";
    return `https://storage.googleapis.com/${bucketName}/${path}`;
  }
  return `${base}/${path}`;
}

export async function uploadBuffer(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<{ path: string; url: string }> {
  const objectPath = path.replace(/^\/+/, "");
  const file = getBucket().file(objectPath);

  await file.save(buffer, {
    contentType: contentType || "application/octet-stream",
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000",
    },
  });

  return { path: objectPath, url: publicUrl(objectPath) };
}

/**
 * V4 signed PUT URL so the browser can upload directly to GCS
 * (bypasses Vercel serverless body size limits).
 */
export async function getSignedUploadUrl(
  path: string,
  contentType: string,
  expiresMs = 15 * 60 * 1000
): Promise<{ uploadUrl: string; path: string; url: string }> {
  const objectPath = path.replace(/^\/+/, "");
  const type = contentType || "application/octet-stream";
  const file = getBucket().file(objectPath);

  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + expiresMs,
    contentType: type,
  });

  return { uploadUrl, path: objectPath, url: publicUrl(objectPath) };
}

function resolveCorsOrigins(): string[] {
  const raw = process.env.UPLOAD_CORS_ORIGINS?.trim();
  if (!raw) return ["*"];
  const origins = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : ["*"];
}

/** Allow browser PUT uploads to the bucket (required for signed URL flow). */
export async function ensureBucketCors(): Promise<void> {
  await getBucket().setCorsConfiguration([
    {
      origin: resolveCorsOrigins(),
      method: ["GET", "HEAD", "PUT", "OPTIONS"],
      responseHeader: ["Content-Type", "Content-Length"],
      maxAgeSeconds: 3600,
    },
  ]);
}

let corsEnsured = false;

/** Idempotent CORS ensure for serverless cold starts. */
export async function ensureBucketCorsOnce(): Promise<void> {
  if (corsEnsured) return;
  await ensureBucketCors();
  corsEnsured = true;
}

export async function listFiles(prefix: string): Promise<
  { name: string; path: string; url: string; size?: number; updated?: string }[]
> {
  const normalized = prefix.replace(/^\/+/, "").replace(/\/?$/, "/");
  const [files] = await getBucket().getFiles({ prefix: normalized });

  return files
    .filter((f) => !f.name.endsWith("/"))
    .map((f) => ({
      name: f.name.split("/").pop() ?? f.name,
      path: f.name,
      url: publicUrl(f.name),
      size: f.metadata?.size ? Number(f.metadata.size) : undefined,
      updated:
        typeof f.metadata?.updated === "string"
          ? f.metadata.updated
          : undefined,
    }));
}

export async function deleteFile(path: string): Promise<void> {
  const objectPath = path.replace(/^\/+/, "");
  await getBucket().file(objectPath).delete({ ignoreNotFound: true });
}

export async function downloadJson<T = unknown>(path: string): Promise<T | null> {
  const objectPath = path.replace(/^\/+/, "");
  const file = getBucket().file(objectPath);
  const [exists] = await file.exists();
  if (!exists) return null;

  const [contents] = await file.download();
  return JSON.parse(contents.toString("utf8")) as T;
}

export async function uploadJson(path: string, obj: unknown): Promise<void> {
  const objectPath = path.replace(/^\/+/, "");
  const body = Buffer.from(JSON.stringify(obj, null, 2), "utf8");
  const file = getBucket().file(objectPath);

  // Article/index JSON must stay fresh — do not use year-long cache like media assets.
  await file.save(body, {
    contentType: "application/json",
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=60, must-revalidate",
    },
  });
}
