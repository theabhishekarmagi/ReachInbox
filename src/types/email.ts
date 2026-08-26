export interface EmailAttachment {
  filename: string;
  contentType?: string;
  content?: string;
  size?: string;
  previewUrl?: string;
}

export interface ScheduleEmailRequest {
  senderEmail: string;
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  delayMs?: number;
  hourlyLimit?: number;
  attachments?: EmailAttachment[];
}

export interface QueuePayload {
  emailJobId: string;
  senderEmail: string;
  hourlyLimit: number;
}
