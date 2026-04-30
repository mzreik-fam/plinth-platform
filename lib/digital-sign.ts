// STUB: Digital signing service for Phase 2
// This will integrate with a digital signature provider

export async function signDocument(documentId: string, userId: string): Promise<{ signedAt: string; signatureUrl: string }> {
  // TODO: Implement real digital signing
  const signedAt = new Date().toISOString();
  console.log('[STUB] signDocument', { documentId, userId, signedAt });
  return {
    signedAt,
    signatureUrl: `https://sign.plinth.ae/${documentId}`,
  };
}

export async function verifySignature(documentId: string): Promise<boolean> {
  // TODO: Implement signature verification
  console.log('[STUB] verifySignature', { documentId });
  return true;
}
