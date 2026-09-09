import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import {
  buildWnsFilter,
  getLeadCollectionName,
  getWnsClient,
  getWnsDbName,
  type SyncedLeadDocument,
} from '@/lib/lead-sync';

const MAX_SELECTION = 5000;

export async function GET(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get('limit') || '100'), 1),
      MAX_SELECTION,
    );
    const cities = parseMultiParam(url.searchParams.get('cities'));
    const courses = parseMultiParam(url.searchParams.get('courses'));
    const search = url.searchParams.get('search') || '';

    const client = await getWnsClient();
    const collection = client
      .db(getWnsDbName())
      .collection<SyncedLeadDocument>(getLeadCollectionName());
    const filter = buildWnsFilter({ cities, courses, search });
    const docs = await collection
      .find(filter, { projection: { crmLeadId: 1 } })
      .sort({ crmUpdatedAt: -1, crmCreatedAt: -1, syncedAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      selectedCount: docs.length,
      leadIds: docs.map((doc) => doc.crmLeadId),
      limit,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Unable to select filtered leads.',
        selectedCount: 0,
        leadIds: [],
      },
      { status: 500 },
    );
  }
}

function parseMultiParam(value: string | null) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item && item !== 'all');
}
