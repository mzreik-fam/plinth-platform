// STUB: Notification service for Phase 2
// This will integrate with Resend (email) and Twilio (SMS/WhatsApp)

export async function sendEmail(to: string, subject: string, body: string) {
  // TODO: Implement Resend integration
  console.log('[STUB] sendEmail', { to, subject, body });
}

export async function sendSMS(to: string, message: string) {
  // TODO: Implement Twilio integration
  console.log('[STUB] sendSMS', { to, message });
}

export async function sendNotification(userId: string, title: string, body: string) {
  // TODO: Implement in-app notification + push
  console.log('[STUB] sendNotification', { userId, title, body });
}
