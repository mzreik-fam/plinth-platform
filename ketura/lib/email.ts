import {Resend} from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({to, subject, html, text}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, email not sent');
    return {success: false, error: 'No API key'};
  }

  try {
    const {data, error} = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Plinth <noreply@plinth.ae>',
      to: Array.isArray(to) ? to : [to],
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
    actionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/en/approvals`,
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
    actionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/en/financial-statement?transaction_id=${transactionId}`,
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

export async function notifyTerminationStep({to, stepName, deadline}: {
  to: string; stepName: string; deadline: string;
}) {
  return sendNotificationEmail({
    to,
    title: `Termination Step: ${stepName}`,
    body: `The termination process has moved to <strong>${stepName}</strong>. The deadline for this step is <strong>${deadline}</strong>. Please ensure all required documentation is submitted.`,
  });
}
