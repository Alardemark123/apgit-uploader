import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { seedSitesConfigIfMissing } from "@/lib/config";
import { bucketExists, createBucket, ensureBucketCors, getBucketName } from "@/lib/gcs";

export async function GET(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const exists = await bucketExists();
    return NextResponse.json({
      exists,
      bucket: getBucketName(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to check bucket status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const bucket = getBucketName();

  try {
    const existedBefore = await bucketExists();
    const createResult = await createBucket();
    const exists = await bucketExists();

    let seeded = false;
    if (exists) {
      try {
        const seedResult = await seedSitesConfigIfMissing();
        seeded = seedResult.seeded;
      } catch (err) {
        const seedMessage =
          err instanceof Error ? err.message : "Failed to seed sites config";
        return NextResponse.json(
          {
            created: createResult.created,
            exists,
            message: `Bucket is ready but sites config could not be seeded: ${seedMessage}`,
          },
          { status: 500 }
        );
      }
    }

    const parts: string[] = [];
    if (createResult.created) {
      parts.push(`Bucket "${bucket}" was created in ${process.env.GCS_BUCKET_LOCATION?.trim() || "asia-southeast1"}.`);
    } else if (existedBefore) {
      parts.push(`Bucket "${bucket}" already exists.`);
    } else {
      parts.push(`Bucket "${bucket}" is ready.`);
    }

    if (seeded) {
      parts.push("Sites config was seeded from data/sites.seed.json.");
    }

    try {
      await ensureBucketCors();
      parts.push("Browser upload CORS was configured on the bucket.");
    } catch (err) {
      const corsMessage =
        err instanceof Error ? err.message : "Failed to set bucket CORS";
      parts.push(
        `Warning: could not configure bucket CORS for direct uploads: ${corsMessage}`
      );
    }

    if (createResult.warning) {
      parts.push(createResult.warning);
    }

    return NextResponse.json({
      created: createResult.created,
      exists,
      seeded,
      message: parts.join(" "),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create bucket";
    return NextResponse.json(
      {
        created: false,
        exists: false,
        message,
      },
      { status: 500 }
    );
  }
}
