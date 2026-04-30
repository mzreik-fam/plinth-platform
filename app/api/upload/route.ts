import {NextRequest, NextResponse} from 'next/server';
import {r2Client, R2_BUCKET, R2_PUBLIC_URL} from '@/lib/r2';
import {PutObjectCommand, DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = formData.get('folder') as string || 'general';
    const entityId = formData.get('entityId') as string || '';

    if (!file) {
      return NextResponse.json({error: 'No file provided'}, {status: 400});
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({error: 'File too large (max 10MB)'}, {status: 400});
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({error: 'Invalid file type'}, {status: 400});
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const key = `${auth.tenantId}/${folder}/${entityId ? entityId + '/' : ''}${Date.now()}-${file.name.replace(/\s+/g, '-')}`;

    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }));

    const url = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : `${process.env.R2_ENDPOINT}/${R2_BUCKET}/${key}`;

    return NextResponse.json({
      success: true,
      file: {
        key,
        name: file.name,
        size: file.size,
        type: file.type,
        url,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({error: 'Upload failed'}, {status: 500});
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  try {
    const {key} = await request.json();
    if (!key) return NextResponse.json({error: 'No key provided'}, {status: 400});

    await r2Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }));

    return NextResponse.json({success: true});
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({error: 'Delete failed'}, {status: 500});
  }
}
