import {S3Client} from '@aws-sdk/client-s3';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || 'https://75ccdc81508339337001b5acc04d6a9f.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

export const R2_BUCKET = process.env.R2_BUCKET || 'plinth-uploads';
// Public URL can be a custom domain or the S3-compatible endpoint
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || `https://${process.env.R2_ACCOUNT_ID || '75ccdc81508339337001b5acc04d6a9f'}.r2.cloudflarestorage.com/${R2_BUCKET}`;
