import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
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
    const collection = client
      .db(getWnsDbName())
      .collection<SyncedLeadDocument>(getLeadCollectionName());
    const docs = await collection
      .find({ crmLeadId: { $in: leadIds } })
      .sort({ crmUpdatedAt: -1, crmCreatedAt: -1, syncedAt: -1 })
      .toArray();

    return NextResponse.json({
      leads: docs.map(toArchiveLead),
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
