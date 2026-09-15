import type { AnyBulkWriteOperation, Db, Document } from 'mongodb';

export const LEAD_HISTORY_COLLECTION = 'leadHistory';

export type LeadHistoryRecord = {
  normalizedPhone: string;
  messageCount: number;
  lastSentAt?: Date;
  blockedAt?: Date;
  blockedReason?: string;
  blockedFromBatchId?: string;
  blockedFromLeadId?: string;
  batchIds?: string[];
  sourceFiles?: string[];
  leadIds?: string[];
  name?: string;
  phone?: string;
  company?: string;
  city?: string;
  updatedAt: Date;
  createdAt?: Date;
};

export function normalizeLeadPhone(value: unknown) {
  const digits = toText(value).replace(/[^\d]/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function leadHistoryCollection(db: Db) {
  return db.collection<LeadHistoryRecord>(LEAD_HISTORY_COLLECTION);
}

export async function getLeadHistoryMap(db: Db, phones: string[]) {
  const normalizedPhones = Array.from(new Set(phones.map(normalizeLeadPhone)))
    .filter(Boolean);
  if (!normalizedPhones.length) return new Map<string, LeadHistoryRecord>();

  const docs = await leadHistoryCollection(db)
    .find({ normalizedPhone: { $in: normalizedPhones } })
    .toArray();
  return new Map(docs.map((doc) => [doc.normalizedPhone, doc]));
}

export async function getBlockedPhones(db: Db) {
  const docs = await leadHistoryCollection(db)
    .find(
      { blockedAt: { $exists: true } },
      { projection: { normalizedPhone: 1 } },
    )
    .toArray();
  return docs.map((doc) => doc.normalizedPhone).filter(Boolean);
}

export function applyLeadHistory<T extends Record<string, unknown>>(
  lead: T,
  history?: LeadHistoryRecord,
) {
  return {
    ...lead,
    messageCount: Number(history?.messageCount || lead.messageCount || 0),
    isBlocked: Boolean(history?.blockedAt || lead.isBlocked),
    blockedAt: history?.blockedAt || lead.blockedAt,
  };
}

export function historyUpsertForLead(
  lead: Record<string, unknown>,
  extra: {
    sourceFile?: string;
    batchId?: string;
    sentAt?: Date;
  } = {},
): AnyBulkWriteOperation<LeadHistoryRecord> | null {
  const normalizedPhone = normalizeLeadPhone(
    lead.normalizedPhone || lead.phone || lead.phoneNumber || lead.mobile,
  );
  if (!normalizedPhone) return null;

  const now = new Date();
  const addToSet: Record<string, unknown> = {};
  if (lead.crmLeadId) addToSet.leadIds = toText(lead.crmLeadId);
  if (extra.sourceFile) addToSet.sourceFiles = extra.sourceFile;
  if (extra.batchId) addToSet.batchIds = extra.batchId;

  const update: Document = {
    $set: {
      normalizedPhone,
      name: toText(lead.name || lead.fullName || lead.leadName),
      phone: toText(lead.phone) || normalizedPhone,
      company: toText(lead.company || lead.organization),
      city: toText(lead.city),
      updatedAt: now,
    },
    $setOnInsert: {
      messageCount: 0,
      createdAt: now,
    },
  };
  if (Object.keys(addToSet).length) {
    update.$addToSet = addToSet;
  }
  if (extra.sentAt) {
    update.$inc = { messageCount: 1 };
    update.$set.lastSentAt = extra.sentAt;
  }

  return {
    updateOne: {
      filter: { normalizedPhone },
      update,
      upsert: true,
    },
  };
}

export async function upsertLeadHistories(
  db: Db,
  leads: Array<Record<string, unknown>>,
  extra: { sourceFile?: string; batchId?: string; sentAt?: Date } = {},
) {
  const operations = leads
    .map((lead) => historyUpsertForLead(lead, extra))
    .filter((operation): operation is AnyBulkWriteOperation<LeadHistoryRecord> =>
      Boolean(operation),
    );
  if (operations.length) {
    await leadHistoryCollection(db).bulkWrite(operations);
  }
}

function toText(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}
