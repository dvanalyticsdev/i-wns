import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import {
  crmArchiveFilter,
  getCrmClient,
  getCrmDbName,
  getLeadCollectionName,
  getWnsClient,
  getWnsDbName,
  leadProjection,
  toBulkOperation,
  toSyncedLead,
  type SyncedLeadDocument,
} from '@/lib/lead-sync';

const SYNC_BATCH_SIZE = 500;

export async function POST(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const crmClient = await getCrmClient();
    const wnsClient = await getWnsClient();
    const crmCollection = crmClient
      .db(getCrmDbName())
      .collection(getLeadCollectionName());
    const wnsCollection = wnsClient
      .db(getWnsDbName())
      .collection<SyncedLeadDocument>(getLeadCollectionName());

    await wnsCollection.createIndex({ crmLeadId: 1 }, { unique: true });
    await wnsCollection.createIndex({ city: 1 });
    await wnsCollection.createIndex({ company: 1 });
    await wnsCollection.createIndex({ normalizedPhone: 1 });
    await wnsCollection.createIndex({ crmUpdatedAt: -1, crmCreatedAt: -1 });

    const totalInCrm = await crmCollection.countDocuments(crmArchiveFilter());
    const cursor = crmCollection
      .find(crmArchiveFilter(), { projection: leadProjection() })
      .sort({ updatedAt: -1, createdAt: -1 });

    let syncedCount = 0;
    let upsertedCount = 0;
    let modifiedCount = 0;
    const activeCrmLeadIds: string[] = [];
    let operations: ReturnType<typeof toBulkOperation>[] = [];

    for await (const doc of cursor) {
      const lead = toSyncedLead(doc);
      activeCrmLeadIds.push(lead.crmLeadId);
      operations.push(toBulkOperation(lead));
      if (operations.length >= SYNC_BATCH_SIZE) {
        const result = await wnsCollection.bulkWrite(operations, {
          ordered: false,
        });
        syncedCount += operations.length;
        upsertedCount += result.upsertedCount;
        modifiedCount += result.modifiedCount;
        operations = [];
      }
    }

    if (operations.length) {
      const result = await wnsCollection.bulkWrite(operations, {
        ordered: false,
      });
      syncedCount += operations.length;
      upsertedCount += result.upsertedCount;
      modifiedCount += result.modifiedCount;
    }

    const staleDeleteResult = await wnsCollection.deleteMany({
      isTestLead: { $ne: true },
      crmLeadId: { $nin: activeCrmLeadIds },
    });
    const storedCount = await wnsCollection.countDocuments({});

    return NextResponse.json({
      status: 'synced',
      totalInCrm,
      syncedCount,
      upsertedCount,
      modifiedCount,
      removedStaleCount: staleDeleteResult.deletedCount,
      storedCount,
      database: getWnsDbName(),
      collection: getLeadCollectionName(),
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Unable to sync CRM leads.',
      },
      { status: 500 },
    );
  }
}
