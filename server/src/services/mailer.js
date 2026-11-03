import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

let transporter = null;

export function isSmtpConfigured() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  return Boolean(host && user && pass);
}

export function getEmailTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  } else {
    // Development/demo simulation mode when SMTP credentials are not yet supplied
    transporter = {
      sendMail: async (options) => {
        console.log(`[Email Simulation Mode]`);
        console.log(`To: ${options.to}`);
        console.log(`Subject: ${options.subject}`);
        if (options.attachments?.length) {
          console.log(`Attachments: ${options.attachments.map((a) => a.filename || a.path).join(', ')}`);
        }
        return {
          messageId: `simulated-${Date.now()}@aurora-hr.internal`,
          response: '250 Simulated delivery: SMTP credentials not set in .env. Email recorded internally.',
          accepted: [options.to],
          rejected: [],
          isSimulated: true,
        };
      },
      verify: async () => true,
    };
  }

  return transporter;
}

export async function sendEmail({ to, subject, html, text, attachments = [] }) {
  const mailer = getEmailTransporter();
  const from = process.env.EMAIL_FROM || '"Aurora Labs People Team" <people@aurorahr.internal>';

  const info = await mailer.sendMail({
    from,
    to,
    subject,
    text: text || html.replace(/<[^>]+>/g, ' '),
    html,
    attachments,
  });

  return info;
}
