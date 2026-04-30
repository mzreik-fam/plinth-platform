import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';

export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{token: string}>}
) {
  try {
    const {token} = await params;

    // Find transaction by portal token
    const transactions = await sql`
      SELECT t.id, t.tenant_id
      FROM transactions t
      WHERE t.portal_token = ${token}
      LIMIT 1
    `;

    if (transactions.length === 0) {
      return NextResponse.json({error: 'Not found'}, {status: 404});
    }

    const transaction = transactions[0];

    // Get documents for this transaction
    const documents = await sql`
      SELECT 
        d.id,
        d.file_name,
        d.file_url,
        d.category,
        d.created_at
      FROM documents d
      WHERE d.transaction_id = ${transaction.id}
        AND d.tenant_id = ${transaction.tenant_id}
      ORDER BY d.created_at DESC
    `;

    return NextResponse.json(documents);
  } catch (error) {
    console.error('Portal documents error:', error);
    return NextResponse.json({error: 'Failed to load documents'}, {status: 500});
  }
}
