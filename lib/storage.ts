// STUB: File storage service for Phase 2
// This will integrate with Cloudflare R2 (S3-compatible)

export async function uploadFile(file: File, path: string): Promise<string> {
  // TODO: Implement R2/S3 upload
  console.log('[STUB] uploadFile', { fileName: file.name, path });
  return `https://storage.plinth.ae/${path}/${file.name}`;
}

export async function getSignedUrl(path: string): Promise<string> {
  // TODO: Implement signed URL generation
  return `https://storage.plinth.ae/${path}`;
}

export async function deleteFile(path: string): Promise<void> {
  // TODO: Implement file deletion
  console.log('[STUB] deleteFile', { path });
}
