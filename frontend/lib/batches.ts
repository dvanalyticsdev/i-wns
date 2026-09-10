import type { Document, WithId } from 'mongodb';

export type BatchRecord = {
  id: string;
  name: string;
  templateId: string;
  templateName?: string;
  leadIds: string[];
  readLeadIds?: string[];
  clickedLeadIds?: string[];
  repliedLeadIds?: string[];
  convertedLeadIds: string[];
  failedLeadIds?: string[];
  sent: number;
  failed: number;
  read: number;
  clicks: number;
  replies: number;
  converted: number;
  createdAt: string;
  status: 'Draft' | 'Sent' | 'Failed' | 'Sending';
};

export function toBatchRecord(doc: WithId<Document>): BatchRecord {
  const readLeadIds = toStringArray(doc.readLeadIds);
  const clickedLeadIds = toStringArray(doc.clickedLeadIds);
  const repliedLeadIds = toStringArray(doc.repliedLeadIds);
  const convertedLeadIds = toStringArray(doc.convertedLeadIds);
  const failedLeadIds = toStringArray(doc.failedLeadIds);
  const leadIds = toStringArray(doc.leadIds);
  return {
    id: String(doc._id),
    name: String(doc.name || 'Untitled batch'),
    templateId: String(doc.templateId || doc.templateName || ''),
    templateName: String(doc.templateName || ''),
    leadIds,
    readLeadIds,
    clickedLeadIds,
    repliedLeadIds,
    convertedLeadIds,
    failedLeadIds,
    sent: Number(doc.sent ?? leadIds.length ?? 0),
    failed: Number(doc.failed ?? failedLeadIds.length ?? 0),
    read: readLeadIds.length,
    clicks: clickedLeadIds.length,
    replies: repliedLeadIds.length,
    converted: convertedLeadIds.length,
    createdAt: formatDate(doc.createdAt),
    status: mapStatus(String(doc.status || 'Draft')),
  };
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function formatDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('en-IN');
}

function mapStatus(status: string): BatchRecord['status'] {
  if (status === 'sent') return 'Sent';
  if (status === 'failed') return 'Failed';
  if (status === 'sending') return 'Sending';
  return 'Draft';
}
