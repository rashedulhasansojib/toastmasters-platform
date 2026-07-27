/**
 * Object-storage seam. All file access is via short-lived signed URLs (MinIO in
 * dev, S3-compatible in prod) — the app never proxies bytes. Implemented in M5
 * (library) with an S3-compatible client; declared here so the port exists from
 * day one. Intentionally no implementation and no SDK dependency yet.
 */
export interface StoragePort {
  /** Time-limited URL the browser uses to upload directly to the bucket. */
  signedUploadUrl(key: string, contentType: string): Promise<string>;
  /** Time-limited URL the browser uses to download an object. */
  signedDownloadUrl(key: string): Promise<string>;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
