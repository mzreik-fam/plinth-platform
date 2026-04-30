import {NextRequest, NextResponse} from 'next/server';
import {r2Client, R2_BUCKET, R2_PUBLIC_URL} from '@/lib/r2';
import {PutObjectCommand} from '@aws-sdk/client-s3';
import {sql} from '@/lib/db';
import {logAudit} from '@/lib/audit';
import {notifyBuyerUpload} from '@/lib/email';

// Buyer portal upload endpoint
// Authenticates via portal token (public access, token-scoped)
// File types: PDF, JPG, PNG only
// Max size: 10MB

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const token = formData.get('token') as string;
    const description = formData.get('description') as string || '';

    // Validate required fields
    if (!file) {
      return NextResponse.json({error: 'No file provided'}, {status: 400});
    }

    if (!token) {
      return NextResponse.json({error: 'Portal token required'}, {status: 400});
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return NextResponse.json({error: 'File too large (max 10MB)'}, {status: 400});
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({
        error: 'Invalid file type. Allowed: PDF, JPG, PNG'
      }, {status: 400});
    }

    // Find transaction by portal token (bypass RLS for public portal)
    const transactions = await sql`
      SELECT t.id, t.tenant_id, t.unit_id, t.buyer_id, t.status,
        u.unit_number,
        b.full_name as buyer_name, b.email as buyer_email,
        proj.name as project_name
      FROM transactions t
      LEFT JOIN units u ON u.id = t.unit_id
      LEFT JOIN buyers b ON b.id = t.buyer_id
      LEFT JOIN projects proj ON proj.id = u.project_id
      WHERE t.portal_token = ${token}
      LIMIT 1
    `;

    if (transactions.length === 0) {
      return NextResponse.json({error: 'Invalid portal token'}, {status: 404});
    }

    const transaction = transactions[0];

    // Only allow uploads for active transactions
    if (transaction.status === 'cancelled' || transaction.status === 'terminated') {
      return NextResponse.json({
        error: 'Upload not allowed for cancelled or terminated transactions'
      }, {status: 403});
    }

    // Upload to R2
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate key: portal-uploads/{tenantId}/{transactionId}/{timestamp}-{filename}
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
    const key = `portal-uploads/${transaction.tenant_id}/${transaction.id}/${Date.now()}-${safeName}`;

    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }));

    const fileUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${key}`
      : `${process.env.R2_ENDPOINT}/${R2_BUCKET}/${key}`;

    // Create document record
    // Note: uploaded_by is NULL for buyer uploads (no user account)
    const documents = await sql`
      INSERT INTO documents (
        tenant_id,
        transaction_id,
        category,
        file_name,
        file_url,
        uploaded_by
      ) VALUES (
        ${transaction.tenant_id},
        ${transaction.id},
        'proof_of_transfer',
        ${file.name},
        ${fileUrl},
        NULL
      )
      RETURNING id
    `;

    const documentId = documents[0]?.id;

    // Log audit entry
    // Use a special user ID for buyer portal actions
    await logAudit({
      tenantId: transaction.tenant_id,
      userId: '00000000-0000-0000-0000-000000000000', // System/buyer portal user
      action: 'create',
      resourceType: 'document',
      resourceId: documentId,
      before: null,
      after: {
        transaction_id: transaction.id,
        category: 'proof_of_transfer',
        file_name: file.name,
        file_url: fileUrl,
        uploaded_by: 'buyer_portal',
        description,
      },
    });

    // Notify assigned admin/agent
    // Find the assigned agent for this transaction
    const agents = await sql`
      SELECT u.email, u.full_name
      FROM transactions t
      LEFT JOIN users u ON u.id = t.agent_id
      WHERE t.id = ${transaction.id} AND t.agent_id IS NOT NULL
    `;

    // Also find super admins and project managers for this tenant
    const admins = await sql`
      SELECT email, full_name
      FROM users
      WHERE tenant_id = ${transaction.tenant_id}
        AND role IN ('super_admin', 'project_manager')
        AND is_active = true
    `;

    const notifyEmails = new Set<string>();
    agents.forEach((a: {email?: string}) => { if (a.email) notifyEmails.add(a.email); });
    admins.forEach((a: {email?: string}) => { if (a.email) notifyEmails.add(a.email); });

    if (notifyEmails.size > 0) {
      await notifyBuyerUpload({
        to: Array.from(notifyEmails),
        buyerName: transaction.buyer_name || 'Buyer',
        unitNumber: transaction.unit_number || 'Unknown',
        projectName: transaction.project_name || 'Unknown Project',
        fileName: file.name,
        transactionId: transaction.id,
      });
    }

    return NextResponse.json({
      success: true,
      document: {
        id: documentId,
        fileName: file.name,
        fileUrl,
        category: 'proof_of_transfer',
        uploadedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('Portal upload error:', error);
    return NextResponse.json({error: 'Upload failed'}, {status: 500});
  }
}
