import {Resend} from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({to, subject, html, text, cc}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, email not sent');
    return {success: false, error: 'No API key'};
  }

  try {
    const {data, error} = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Plinth <noreply@plinth.ae>',
      to: Array.isArray(to) ? to : [to],
      cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });

    if (error) {
      console.error('Resend error:', error);
      return {success: false, error};
    }

    console.log('Email sent:', data?.id);
    return {success: true, id: data?.id};
  } catch (err) {
    console.error('Email send failed:', err);
    return {success: false, error: err};
  }
}

export async function sendNotificationEmail({
  to,
  title,
  body,
  actionUrl,
  actionLabel,
}: {
  to: string;
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
}) {
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1c1917;">
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="font-size:24px;font-weight:700;margin:0;">Plinth</h1>
        <p style="font-size:12px;color:#78716c;margin:4px 0 0;letter-spacing:2px;text-transform:uppercase;">Real Estate Platform</p>
      </div>
      <div style="background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:32px;">
        <h2 style="font-size:18px;font-weight:600;margin:0 0 16px;">${title}</h2>
        <p style="font-size:15px;line-height:1.6;color:#44403c;margin:0 0 24px;">${body}</p>
        ${actionUrl ? `
          <div style="text-align:center;">
            <a href="${actionUrl}" style="display:inline-block;background:#1c1917;color:#faf9f7;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500;">${actionLabel || 'View Details'}</a>
          </div>
        ` : ''}
      </div>
      <p style="font-size:12px;color:#a8a29e;text-align:center;margin-top:24px;">This is an automated notification from Plinth. Please do not reply to this email.</p>
    </div>
  `;

  return sendEmail({to, subject: title, html});
}

// Specific notification templates
export async function notifyUnitApprovalRequested({to, unitNumber, projectName, requestedBy}: {
  to: string; unitNumber: string; projectName: string; requestedBy: string;
}) {
  return sendNotificationEmail({
    to,
    title: 'Unit Approval Requested',
    body: `${requestedBy} has requested approval for unit <strong>${unitNumber}</strong> in <strong>${projectName}</strong>. Please review and approve or reject.`,
    actionUrl: `${process.env.NEXT_PUBLIC_APP_URL?.trim()}/en/approvals`,
    actionLabel: 'Review Approval',
  });
}

export async function notifyUnitApproved({to, unitNumber, projectName}: {
  to: string; unitNumber: string; projectName: string;
}) {
  return sendNotificationEmail({
    to,
    title: 'Unit Approved',
    body: `Unit <strong>${unitNumber}</strong> in <strong>${projectName}</strong> has been approved and is now live.`,
  });
}

export async function notifyPaymentReceived({to, unitNumber, amount, transactionId}: {
  to: string; unitNumber: string; amount: number; transactionId: string;
}) {
  return sendNotificationEmail({
    to,
    title: 'Payment Received',
    body: `A payment of <strong>AED ${amount.toLocaleString()}</strong> has been confirmed for unit <strong>${unitNumber}</strong>.`,
    actionUrl: `${process.env.NEXT_PUBLIC_APP_URL?.trim()}/en/financial-statement?transaction_id=${transactionId}`,
    actionLabel: 'View Statement',
  });
}

export async function notifyPaymentDue({to, unitNumber, amount, dueDate}: {
  to: string; unitNumber: string; amount: number; dueDate: string;
}) {
  return sendNotificationEmail({
    to,
    title: 'Payment Due Reminder',
    body: `Your payment of <strong>AED ${amount.toLocaleString()}</strong> for unit <strong>${unitNumber}</strong> is due on <strong>${dueDate}</strong>. Please ensure timely payment to avoid penalties.`,
  });
}

export async function notifyHandoverStarted({to, unitNumber}: {
  to: string; unitNumber: string;
}) {
  return sendNotificationEmail({
    to,
    title: 'Handover Process Started',
    body: `The handover process for unit <strong>${unitNumber}</strong> has begun. You will receive updates at each step.`,
  });
}

export async function notifySnaggingTicketCreated({to, unitNumber, ticketTitle}: {
  to: string; unitNumber: string; ticketTitle: string;
}) {
  return sendNotificationEmail({
    to,
    title: 'Snagging Ticket Created',
    body: `A snagging ticket has been created for unit <strong>${unitNumber}</strong>: <strong>${ticketTitle}</strong>. Our engineering team will resolve this promptly.`,
  });
}

export async function notifyUserInvitation({to, fullName, inviteUrl}: {
  to: string; fullName: string; inviteUrl: string;
}) {
  return sendNotificationEmail({
    to,
    title: 'You\'ve been invited to Plinth',
    body: `Hi <strong>${fullName}</strong>,<br><br>You have been invited to join <strong>Plinth</strong> — the real estate project management platform.<br><br>Click the button below to set up your account and create your password.`,
    actionUrl: inviteUrl,
    actionLabel: 'Accept Invitation',
  });
}

// EOI Expiry Reminder
export async function sendEOIReminder({
  to,
  cc,
  buyerName,
  unitNumber,
  projectName,
  eoiAmount,
  hoursRemaining,
  deadline,
  portalUrl,
}: {
  to: string;
  cc?: string;
  buyerName: string;
  unitNumber: string;
  projectName: string;
  eoiAmount: number;
  hoursRemaining: number;
  deadline: string;
  portalUrl: string;
}) {
  const urgencyLabel = hoursRemaining <= 24 ? 'URGENT' : 'Reminder';
  const hoursText = hoursRemaining === 0 
    ? 'today' 
    : hoursRemaining < 24 
      ? `${hoursRemaining} hours` 
      : `${Math.floor(hoursRemaining / 24)} days`;

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1c1917;">
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="font-size:24px;font-weight:700;margin:0;">Plinth</h1>
        <p style="font-size:12px;color:#78716c;margin:4px 0 0;letter-spacing:2px;text-transform:uppercase;">Real Estate Platform</p>
      </div>
      <div style="background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:32px;">
        <h2 style="font-size:18px;font-weight:600;margin:0 0 16px;">${urgencyLabel}: EOI Expiring Soon</h2>
        <p style="font-size:15px;line-height:1.6;color:#44403c;margin:0 0 24px;">
          Dear <strong>${buyerName}</strong>,<br><br>
          Your Expression of Interest (EOI) for unit <strong>${unitNumber}</strong> in <strong>${projectName}</strong> is expiring in <strong>${hoursText}</strong>.
        </p>
        <div style="background:#faf9f7;border:1px solid #e7e5e4;border-radius:8px;padding:16px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:14px;"><strong>EOI Amount:</strong> AED ${eoiAmount.toLocaleString()}</p>
          <p style="margin:0 0 8px;font-size:14px;"><strong>Deadline:</strong> ${deadline}</p>
          <p style="margin:0;font-size:14px;color:#dc2626;"><strong>Time Remaining:</strong> ${hoursText}</p>
        </div>
        <p style="font-size:15px;line-height:1.6;color:#44403c;margin:0 0 24px;">
          To secure your unit, please complete your payment before the deadline. If payment is not received by the expiry date, the unit will be released back to available inventory.
        </p>
        <div style="text-align:center;">
          <a href="${portalUrl}" style="display:inline-block;background:#1c1917;color:#faf9f7;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500;">Upload Payment Proof</a>
        </div>
      </div>
      <p style="font-size:12px;color:#a8a29e;text-align:center;margin-top:24px;">This is an automated notification from Plinth. Please do not reply to this email.</p>
    </div>
  `;

  return sendEmail({
    to,
    cc,
    subject: `${urgencyLabel}: EOI for ${unitNumber} expires in ${hoursText}`,
    html,
  });
}

// Buyer portal upload notification
export async function notifyBuyerUpload({
  to,
  buyerName,
  unitNumber,
  projectName,
  fileName,
  transactionId,
}: {
  to: string | string[];
  buyerName: string;
  unitNumber: string;
  projectName: string;
  fileName: string;
  transactionId: string;
}) {
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1c1917;">
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="font-size:24px;font-weight:700;margin:0;">Plinth</h1>
        <p style="font-size:12px;color:#78716c;margin:4px 0 0;letter-spacing:2px;text-transform:uppercase;">Real Estate Platform</p>
      </div>
      <div style="background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:32px;">
        <h2 style="font-size:18px;font-weight:600;margin:0 0 16px;">Payment Proof Uploaded</h2>
        <p style="font-size:15px;line-height:1.6;color:#44403c;margin:0 0 24px;">
          <strong>${buyerName}</strong> has uploaded a payment proof document for unit <strong>${unitNumber}</strong> in <strong>${projectName}</strong>.
        </p>
        <div style="background:#f5f5f4;border-radius:8px;padding:16px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:14px;"><strong>File:</strong> ${fileName}</p>
          <p style="margin:0;font-size:14px;color:#78716c;">This upload is pending admin review.</p>
        </div>
        <div style="text-align:center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL?.trim()}/en/payments/pending" style="display:inline-block;background:#1c1917;color:#faf9f7;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500;">Review Payment</a>
        </div>
      </div>
      <p style="font-size:12px;color:#a8a29e;text-align:center;margin-top:24px;">This is an automated notification from Plinth. Please do not reply to this email.</p>
    </div>
  `;

  return sendEmail({
    to: Array.isArray(to) ? to : [to],
    subject: `Payment Proof Uploaded - Unit ${unitNumber}`,
    html,
  });
}

export async function notifyHandoverReady({to, recipientName, unitNumber, handoverId}: {
  to: string; recipientName: string; unitNumber: string; handoverId: string;
}) {
  return sendNotificationEmail({
    to,
    title: 'Handover Ready for Key Handover',
    body: `Hi <strong>${recipientName}</strong>,<br><br>All snagging tickets for unit <strong>${unitNumber}</strong> have been resolved. The handover status has been automatically advanced to <strong>Ready for Handover</strong>.<br><br>You can now proceed with the key handover process.`,
    actionUrl: `${process.env.NEXT_PUBLIC_APP_URL?.trim()}/en/handovers/${handoverId}`,
    actionLabel: 'View Handover',
  });
}
