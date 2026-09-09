import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import {
  buildWnsFilter,
  getLeadCollectionName,
  getWnsClient,
  getWnsDbName,
  PAGE_SIZE,
  toArchiveLead,
  type SyncedLeadDocument,
} from '@/lib/lead-sync';

export async function GET(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const url = new URL(request.url);
    const page = Math.max(Number(url.searchParams.get('page') || '1'), 1);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get('limit') || PAGE_SIZE), 1),
      PAGE_SIZE,
    );
    const city = url.searchParams.get('city') || 'all';
    const course = url.searchParams.get('course') || 'all';
    const search = url.searchParams.get('search') || '';

    const client = await getWnsClient();
    const db = client.db(getWnsDbName());
    const collection = db.collection<SyncedLeadDocument>(
      getLeadCollectionName(),
    );
    const filter = buildWnsFilter({ city, course, search });
    const skip = (page - 1) * limit;

    const [archiveCount, filteredCount, docs, cities, courses, lastSynced] =
      await Promise.all([
        collection.countDocuments({}),
        collection.countDocuments(filter),
        collection
          .find(filter)
          .sort({ crmUpdatedAt: -1, crmCreatedAt: -1, syncedAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        collection.distinct('city', {}),
        collection.distinct('company', {}),
        collection.findOne({}, { sort: { syncedAt: -1 } }),
      ]);

    return NextResponse.json({
      status: 'connected',
      archiveCount,
      filteredCount,
      page,
      limit,
      totalPages: Math.max(Math.ceil(filteredCount / limit), 1),
      leads: docs.map(toArchiveLead),
      cities: cleanFacetValues(cities),
      courses: cleanFacetValues(courses),
      collection: getLeadCollectionName(),
      database: getWnsDbName(),
      lastSyncedAt: lastSynced?.syncedAt || null,
      archiveRule:
        'Main Admission Calling synced from i-crm into i-wns database.',
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
        filteredCount: 0,
        page: 1,
        limit: PAGE_SIZE,
        totalPages: 1,
        leads: [],
        cities: [],
        courses: [],
      },
      { status: 500 },
    );
  }
}

function cleanFacetValues(values: unknown[]) {
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value && value !== '-')
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 250);
}
