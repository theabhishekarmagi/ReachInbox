import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS
  }
});

export async function sendEmail(input: {
  to: string;
  subject: string;
  body: string;
  senderEmail: string;
  attachments?: Array<{ filename: string; content?: string; contentType?: string }>;
}) {
  const mailAttachments = input.attachments?.map((att) => {
    let contentBuffer: Buffer | string | undefined = att.content;
    if (typeof att.content === 'string' && att.content.includes('base64,')) {
      contentBuffer = Buffer.from(att.content.split('base64,')[1], 'base64');
    }
    return {
      filename: att.filename,
      content: contentBuffer,
      contentType: att.contentType
    };
  });

  const info = await transporter.sendMail({
    from: `"${env.SMTP_FROM_NAME}" <${input.senderEmail}>`,
    to: input.to,
    subject: input.subject,
    text: input.body,
    attachments: mailAttachments
  });

  return { messageId: info.messageId };
}
