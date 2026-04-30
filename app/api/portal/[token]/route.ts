import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';

export async function GET(request: NextRequest, {params}: {params: Promise<{token: string}>}) {
  try {
    const {token} = await params;

    // Find transaction by portal token (bypass RLS for public portal)
    const transactions = await sql`
      SELECT t.*,
        u.unit_number, u.unit_type, u.bedrooms, u.bathrooms, u.area_sqft, u.price as unit_price,
        b.full_name as buyer_name, b.phone as buyer_phone, b.email as buyer_email,
        pp.name as payment_plan_name, pp.milestones as payment_plan_milestones
      FROM transactions t
      LEFT JOIN units u ON u.id = t.unit_id
      LEFT JOIN buyers b ON b.id = t.buyer_id
      LEFT JOIN payment_plans pp ON pp.id = t.payment_plan_id
      WHERE t.portal_token = ${token}
      LIMIT 1
    `;

    if (transactions.length === 0) {
      return NextResponse.json({error: 'Not found'}, {status: 404});
    }

    const transaction = transactions[0];

    // Get payments for this transaction
    const payments = await sql`
      SELECT * FROM payments WHERE transaction_id = ${transaction.id} ORDER BY created_at DESC
    `;

    // Calculate remaining balance
    const totalPaid = payments
      .filter((p) => p.status === 'confirmed')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const remainingBalance = Number(transaction.total_price) - totalPaid;

    return NextResponse.json({
      transaction,
      payments,
      totalPaid,
      remainingBalance,
    });
  } catch (error) {
    console.error('Portal error:', error);
    return NextResponse.json({error: 'Failed to load portal'}, {status: 500});
  }
}
