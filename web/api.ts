import type { EmailItem, User } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ user: User }>('/auth/me'),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  scheduled: () => request<EmailItem[]>('/api/emails/scheduled'),
  sent: () => request<EmailItem[]>('/api/emails/sent'),
  starred: () => request<EmailItem[]>('/api/emails/starred'),
  getEmail: (id: string) => request<EmailItem>(`/api/emails/${id}`),
  deleteEmail: (id: string) => request<void>(`/api/emails/${id}`, { method: 'DELETE' }),
  toggleStar: (id: string, is_starred: boolean) =>
    request<{ id: string; is_starred: boolean }>(`/api/emails/${id}/star`, {
      method: 'PATCH',
      body: JSON.stringify({ is_starred })
    }),
  scheduleEmail: (payload: {
    senderEmail: string;
    subject: string;
    body: string;
    recipients: string[];
    startTime: string;
    delayMs: number;
    hourlyLimit: number;
    attachments?: Array<{
      filename: string;
      contentType?: string;
      content?: string;
      size?: string;
      previewUrl?: string;
    }>;
  }) => request<{ campaignId: string; scheduledCount: number }>('/api/emails/schedule', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
};
