import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import { applyLeadHistory, getLeadHistoryMap } from '@/lib/lead-history';
import {
  getLeadCollectionName,
  getWnsClient,
  getWnsDbName,
  toArchiveLead,
  type SyncedLeadDocument,
} from '@/lib/lead-sync';

const MAX_IDS = 5000;

export async function POST(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const body = (await request.json()) as { leadIds?: string[] };
    const leadIds = Array.from(new Set(body.leadIds || []))
      .filter(Boolean)
      .slice(0, MAX_IDS);

    const client = await getWnsClient();
    const db = client.db(getWnsDbName());
    const collection = db.collection<SyncedLeadDocument>(getLeadCollectionName());
    const docs = await collection
      .find({ crmLeadId: { $in: leadIds } })
      .sort({
        messageCount: 1,
        crmUpdatedAt: -1,
        crmCreatedAt: -1,
        syncedAt: -1,
      })
      .toArray();
    const historyByPhone = await getLeadHistoryMap(
      db,
      docs.map((doc) => doc.normalizedPhone || doc.phone),
    );

    return NextResponse.json({
      leads: docs.map((doc) =>
        toArchiveLead(
          applyLeadHistory(
            doc,
            historyByPhone.get(doc.normalizedPhone || doc.phone),
          ),
        ),
      ),
      requestedCount: leadIds.length,
      returnedCount: docs.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Unable to load batch leads.',
        leads: [],
      },
      { status: 500 },
    );
  }
}
