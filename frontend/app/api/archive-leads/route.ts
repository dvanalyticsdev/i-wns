import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { MongoClient, type Document } from 'mongodb';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';

const ARCHIVED_COUNSELOR = 'Archived Leads';
const MAIN_ADMISSION_PIPELINE = 'main-admission';
const DEFAULT_DB_NAME = 'i-crm-workshop';
const DEFAULT_LEADS_COLLECTION = 'leads';

let cachedClient: MongoClient | null = null;

type ArchiveLead = {
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

export async function GET(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
      return NextResponse.json(
        {
          status: 'missing_config',
          message: 'MONGODB_URI is not configured for i-wns.',
          archiveCount: 0,
          leads: [],
        },
        { status: 503 },
      );
    }

    const client = await getClient(uri);
    const db = client.db(process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME);
    const collection = db.collection(
      process.env.MONGODB_LEADS_COLLECTION || DEFAULT_LEADS_COLLECTION,
    );
    const archiveFilter = {
      $and: [
        { counselor: new RegExp(`^${ARCHIVED_COUNSELOR}$`, 'i') },
        { leadPipeline: MAIN_ADMISSION_PIPELINE },
      ],
    };

    const [archiveCount, docs] = await Promise.all([
      collection.countDocuments(archiveFilter),
      collection
        .find(archiveFilter, {
          projection: {
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
          },
        })
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(50)
        .toArray(),
    ]);

    return NextResponse.json({
      status: 'connected',
      archiveCount,
      leads: docs.map(toArchiveLead),
      collection: 'leads',
      archiveRule:
        'Main Admission Calling only: leadPipeline=main-admission and counselor=Archived Leads',
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to load archived leads.',
        archiveCount: 0,
        leads: [],
      },
      { status: 500 },
    );
  }
}

async function getClient(uri: string) {
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, { maxPoolSize: 10, minPoolSize: 0 });
    await cachedClient.connect();
  }
  return cachedClient;
}

function toArchiveLead(doc: Document): ArchiveLead {
  const id = String(doc._id || '');
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
      pickText(doc, ['lastActivity']) ||
      formatDate(pickText(doc, ['lastActivityAt', 'updatedAt', 'createdAt'])) ||
      'No recent activity',
    status: 'Archived',
    score: scoreLead(stage),
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
