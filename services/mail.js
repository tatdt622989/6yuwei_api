/** Sends one email through Resend. Throws when the service refuses it or is not configured. */
const sendMail = async ({ to, subject, html }) => {
  const from = process.env.ACCOUNT_MAIL_FROM || process.env.CONTACT_MAIL_FROM;
  if (!process.env.RESEND_API_KEY || !from) {
    throw new Error('mail service is not configured');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from, to: [to], subject, html,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const reason = (await response.text()).slice(0, 300);
    throw new Error(`mail service answered ${response.status}: ${reason}`);
  }
};

module.exports = { sendMail };
