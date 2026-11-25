import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

/**
 * Sends an email notification if SMTP is configured; otherwise gracefully no-ops.
 */
export async function sendEmailNotification({ to, subject, text, html }) {
  const transport = getTransporter();
  if (!transport || !to) return { sent: false, reason: 'SMTP not configured' };

  try {
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM || 'Sage X3 Desk <noreply@sagex3desk.local>',
      to,
      subject,
      text,
      html,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.warn('Email delivery skipped:', err.message);
    return { sent: false, reason: err.message };
  }
}
