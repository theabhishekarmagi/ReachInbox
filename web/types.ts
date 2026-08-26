export interface User {
  displayName: string;
  email: string;
  picture: string;
}

export interface EmailAttachment {
  filename: string;
  contentType?: string;
  content?: string;
  size?: string;
  previewUrl?: string;
}

export interface EmailItem {
  id: string;
  email: string;
  sender_email?: string;
  subject: string;
  body?: string;
  status: string;
  scheduled_at?: string;
  sent_at?: string;
  error_message?: string | null;
  attachments?: EmailAttachment[];
  created_at?: string;
  is_starred?: boolean;
}
