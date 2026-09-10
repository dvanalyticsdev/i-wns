import {
  MongoClient,
  type AnyBulkWriteOperation,
  type Document,
  type Filter,
} from 'mongodb';

export const ARCHIVED_COUNSELOR = 'Archived Leads';
export const MAIN_ADMISSION_PIPELINE = 'main-admission';
export const DEFAULT_CRM_DB_NAME = 'i-crm-workshop';
export const DEFAULT_WNS_DB_NAME = 'i-wns';
export const DEFAULT_LEADS_COLLECTION = 'leads';
export const PAGE_SIZE = 100;

let crmClient: MongoClient | null = null;
let wnsClient: MongoClient | null = null;

export type ArchiveLead = {
  id: string;
  name: string;
  company: string;
  phone: string;
  city: string;
  source: string;
  stage: string;
  lastAction: string;
  status: string;
  score: number;
};

export type SyncedLeadDocument = ArchiveLead & {
  crmLeadId: string;
  leadPipeline: string;
  counselor: string;
  normalizedPhone: string;
  isTestLead?: boolean;
  syncedAt: Date;
  crmUpdatedAt?: Date | string;
  crmCreatedAt?: Date | string;
};

export function crmArchiveFilter() {
  return {
    $and: [
      { counselor: new RegExp(`^${ARCHIVED_COUNSELOR}$`, 'i') },
      { leadPipeline: MAIN_ADMISSION_PIPELINE },
    ],
  };
}

export function leadProjection() {
  return {
    _id: 1,
    firstName: 1,
    lastName: 1,
    name: 1,
    fullName: 1,
    leadName: 1,
    email: 1,
    phone: 1,
    phoneNumber: 1,
    mobile: 1,
    mx_Phone: 1,
    company: 1,
    organization: 1,
    city: 1,
    source: 1,
    leadSource: 1,
    origin: 1,
    leadPipeline: 1,
    createdAt: 1,
    updatedAt: 1,
    counselor: 1,
    courseName: 1,
    workshop: 1,
    admissionStatus: 1,
    courseStatus: 1,
    wsStatus: 1,
    lastActivity: 1,
    lastActivityAt: 1,
  };
}

export function getCrmUri() {
  return process.env.CRM_MONGODB_URI || process.env.MONGODB_URI || '';
}

export function getWnsUri() {
  return process.env.WNS_MONGODB_URI || '';
}

export function getCrmDbName() {
  return process.env.CRM_MONGODB_DB_NAME || DEFAULT_CRM_DB_NAME;
}

export function getWnsDbName() {
  return process.env.WNS_MONGODB_DB_NAME || DEFAULT_WNS_DB_NAME;
}

export function getLeadCollectionName() {
  return process.env.MONGODB_LEADS_COLLECTION || DEFAULT_LEADS_COLLECTION;
}

export async function getCrmClient() {
  const uri = getCrmUri();
  if (!uri) {
    throw new Error('CRM_MONGODB_URI is not configured for i-wns sync.');
  }
  if (!crmClient) {
    crmClient = new MongoClient(uri, { maxPoolSize: 10, minPoolSize: 0 });
    await crmClient.connect();
  }
  return crmClient;
}

export async function getWnsClient() {
  const uri = getWnsUri();
  if (!uri) {
    throw new Error('WNS_MONGODB_URI is not configured for i-wns.');
  }
  if (!wnsClient) {
    wnsClient = new MongoClient(uri, { maxPoolSize: 10, minPoolSize: 0 });
    await wnsClient.connect();
  }
  return wnsClient;
}

export function buildWnsFilter({
  city,
  cities,
  course,
  courses,
  search,
}: {
  city?: string;
  cities?: string[];
  course?: string;
  courses?: string[];
  search?: string;
}) {
  const filter: Filter<SyncedLeadDocument> = {};
  const cityValues = cleanFilterValues(
    cities?.length ? cities : city ? [city] : [],
  );
  const courseValues = cleanFilterValues(
    courses?.length ? courses : course ? [course] : [],
  );
  if (cityValues.length) {
    filter.city = { $in: cityValues };
  }
  if (courseValues.length) {
    filter.company = { $in: courseValues };
  }
  if (search?.trim()) {
    const term = escapeRegex(search.trim());
    filter.$or = [
      { name: new RegExp(term, 'i') },
      { phone: new RegExp(term, 'i') },
      { city: new RegExp(term, 'i') },
      { company: new RegExp(term, 'i') },
    ];
  }
  return filter;
}

export function toSyncedLead(doc: Document): SyncedLeadDocument {
  const lead = toArchiveLead(doc);
  return {
    ...lead,
    crmLeadId: lead.id,
    leadPipeline: MAIN_ADMISSION_PIPELINE,
    counselor: ARCHIVED_COUNSELOR,
    normalizedPhone: normalizePhone(lead.phone),
    syncedAt: new Date(),
    crmUpdatedAt: doc.updatedAt,
    crmCreatedAt: doc.createdAt,
  };
}

export function toArchiveLead(doc: Document): ArchiveLead {
  const id = String(doc.crmLeadId || doc._id || '');
  const firstName = pickText(doc, ['firstName']);
  const lastName = pickText(doc, ['lastName']);
  const composedName = [firstName, lastName].filter(Boolean).join(' ');
  const name =
    pickText(doc, ['name', 'fullName', 'leadName']) ||
    composedName ||
    'Unnamed lead';
  const stage =
    pickText(doc, [
      'admissionStatus',
      'courseStatus',
      'wsStatus',
      'leadPipeline',
      'stage',
    ]) || 'Archived';

  return {
    id,
    name,
    company:
      pickText(doc, ['company', 'organization', 'courseName', 'workshop']) ||
      'Not specified',
    phone: pickText(doc, ['phone', 'phoneNumber', 'mobile', 'mx_Phone']) || '-',
    city: pickText(doc, ['city']) || '-',
    source: pickText(doc, ['leadSource', 'source', 'origin']) || 'CRM archive',
    stage,
    lastAction:
      pickText(doc, ['lastAction', 'lastActivity']) ||
      formatDate(
        pickText(doc, [
          'lastActivityAt',
          'updatedAt',
          'crmUpdatedAt',
          'createdAt',
          'crmCreatedAt',
        ]),
      ) ||
      'No recent activity',
    status: pickText(doc, ['status']) || 'Archived',
    score: typeof doc.score === 'number' ? doc.score : scoreLead(stage),
  };
}

export function toBulkOperation(
  lead: SyncedLeadDocument,
): AnyBulkWriteOperation<SyncedLeadDocument> {
  return {
    updateOne: {
      filter: { crmLeadId: lead.crmLeadId },
      update: {
        $set: lead,
        $setOnInsert: {
          reachedOut: false,
          createdInWnsAt: new Date(),
        },
      },
      upsert: true,
    },
  };
}

function pickText(doc: Document, keys: string[]) {
  for (const key of keys) {
    const value = doc[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
  }
  return '';
}

function formatDate(value: string) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `Updated ${date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}`;
}

function scoreLead(stage: string) {
  const normalized = stage.toLowerCase();
  if (normalized.includes('interested') || normalized.includes('won')) {
    return 80;
  }
  if (normalized.includes('not interested') || normalized.includes('lost')) {
    return 20;
  }
  return 50;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanFilterValues(values: string[]) {
  return values
    .map((value) => value.trim())
    .filter((value) => value && value !== 'all');
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, '');
}
