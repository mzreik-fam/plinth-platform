import {NextRequest, NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {logAudit} from '@/lib/audit';

async function getAuthUser() {
  const token = await getSessionCookie();
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

/**
 * Validate that all mandatory fields are present for a step to be marked completed.
 * Per D-017: airway_bill_url and email_proof_url are mandatory.
 */
function validateMandatoryFields(step: Record<string, unknown>): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  if (!step.airway_bill_url) {
    missing.push('airway_bill_url');
  }
  if (!step.email_proof_url) {
    missing.push('email_proof_url');
  }
  
  return { valid: missing.length === 0, missing };
}

/**
 * Check if the prior step is completed with all mandatory fields.
 * Returns { canProceed: boolean, reason?: string }
 */
async function validatePriorStepCompleted(
  caseId: string, 
  currentStepNumber: number
): Promise<{ canProceed: boolean; reason?: string }> {
  if (currentStepNumber === 1) {
    // Step 1 has no prior step
    return { canProceed: true };
  }
  
  const priorStep = await sql`
    SELECT * FROM termination_steps 
    WHERE termination_case_id = ${caseId} 
    AND step_number = ${currentStepNumber - 1}
  `;
  
  if (!priorStep.length) {
    return { canProceed: false, reason: `Prior step ${currentStepNumber - 1} not found` };
  }
  
  if (priorStep[0].status !== 'completed') {
    return { 
      canProceed: false, 
      reason: `Step ${currentStepNumber - 1} must be completed before completing Step ${currentStepNumber}` 
    };
  }
  
  // Also validate prior step has mandatory fields
  const validation = validateMandatoryFields(priorStep[0]);
  if (!validation.valid) {
    return { 
      canProceed: false, 
      reason: `Step ${currentStepNumber - 1} is missing mandatory fields: ${validation.missing.join(', ')}` 
    };
  }
  
  return { canProceed: true };
}

export async function PATCH(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

  await sql`SELECT set_config('app.current_tenant_id', ${auth.tenantId}, true)`;
  const {id} = await params;

  const body = await request.json();

  // Fetch the current step
  const existingSteps = await sql`SELECT * FROM termination_steps WHERE id = ${id}`;
  if (!existingSteps.length) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }
  const existing = existingSteps[0];
  const caseId = existing.termination_case_id;
  const stepNumber = existing.step_number;

  // If marking as completed, enforce validations
  if (body.status === 'completed') {
    // D-013: Validate prior step is completed
    const priorValidation = await validatePriorStepCompleted(caseId, stepNumber);
    if (!priorValidation.canProceed) {
      return NextResponse.json(
        {error: 'Step sequence violation', message: priorValidation.reason}, 
        {status: 400}
      );
    }
    
    // D-017: Validate mandatory fields are present
    // Merge existing with updates for validation
    const mergedStep = {...existing, ...body};
    const fieldValidation = validateMandatoryFields(mergedStep);
    if (!fieldValidation.valid) {
      return NextResponse.json(
        {error: 'Missing mandatory fields', missing: fieldValidation.missing}, 
        {status: 400}
      );
    }
  }

  const result = await sql`
    UPDATE termination_steps
    SET
      status = COALESCE(${body.status || null}, status),
      notice_sent_at = COALESCE(${body.notice_sent_at || null}, notice_sent_at),
      notice_method = COALESCE(${body.notice_method || null}, notice_method),
      courier_tracking = COALESCE(${body.courier_tracking || null}, courier_tracking),
      airway_bill_url = COALESCE(${body.airway_bill_url || null}, airway_bill_url),
      email_proof_url = COALESCE(${body.email_proof_url || null}, email_proof_url),
      receipt_confirmed_at = COALESCE(${body.receipt_confirmed_at || null}, receipt_confirmed_at),
      notes = COALESCE(${body.notes || null}, notes),
      completed_at = COALESCE(${body.completed_at || null}, completed_at)
    WHERE id = ${id}
    RETURNING *
  `;

  if (!result.length) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  const updatedStep = result[0];

  // D-008: If receipt_confirmed_at was just set, recalculate next step's deadline
  if (body.receipt_confirmed_at && stepNumber < 4) {
    const nextStepNumber = stepNumber + 1;
    await sql`
      UPDATE termination_steps
      SET deadline_date = (${body.receipt_confirmed_at}::date + (30 * INTERVAL '1 day'))
      WHERE termination_case_id = ${caseId}
      AND step_number = ${nextStepNumber}
    `;
  }

  // Also recalculate if notice_sent_at was set on Step 1 and deadline needs update
  if (body.notice_sent_at && stepNumber === 1 && !existing.notice_sent_at) {
    await sql`
      UPDATE termination_steps
      SET deadline_date = (${body.notice_sent_at}::date + (30 * INTERVAL '1 day'))
      WHERE id = ${id}
    `;
  }

  const auditAction = body.status === 'completed' ? 'status_change' : 'update';
  await logAudit({ 
    tenantId: auth.tenantId, 
    userId: auth.userId, 
    action: auditAction, 
    resourceType: 'termination_step', 
    resourceId: updatedStep.id, 
    before: existing || null, 
    after: updatedStep 
  });

  // If step completed, check if we should advance the case
  if (body.status === 'completed') {
    // Update case current step
    await sql`
      UPDATE termination_cases
      SET current_step = ${stepNumber + 1}, updated_at = NOW()
      WHERE id = ${caseId}
    `;

    // If step 4 completed, mark case as completed
    if (stepNumber === 4) {
      await sql`
        UPDATE termination_cases
        SET status = 'completed', updated_at = NOW()
        WHERE id = ${caseId}
      `;
    }
  }

  return NextResponse.json({step: updatedStep});
}
