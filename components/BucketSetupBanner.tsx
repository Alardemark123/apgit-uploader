"use client";

type Props = {
  bucket: string;
  creating: boolean;
  createError: string | null;
  createMessage: string | null;
  onCreate: () => void;
};

export default function BucketSetupBanner({
  bucket,
  creating,
  createError,
  createMessage,
  onCreate,
}: Props) {
  return (
    <section
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm"
      role="alert"
    >
      <h2 className="text-sm font-semibold text-amber-950">
        Storage bucket setup required
      </h2>
      <p className="mt-2 text-sm text-amber-900">
        Bucket{" "}
        <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
          {bucket}
        </code>{" "}
        does not exist yet. Create it to enable uploads and file browsing.
      </p>
      <p className="mt-1 text-xs text-amber-800">
        The bucket will be created in your configured GCP region with public
        read access for marketing assets.
      </p>

      {createError && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {createError}
        </p>
      )}

      {createMessage && !createError && (
        <p className="mt-3 text-sm text-emerald-800">{createMessage}</p>
      )}

      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="mt-4 rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {creating ? "Creating bucket…" : "Create bucket"}
      </button>
    </section>
  );
}
