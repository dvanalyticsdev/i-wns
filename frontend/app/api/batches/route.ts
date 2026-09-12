import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import { toBatchRecord } from '@/lib/batches';
import { getWnsClient, getWnsDbName } from '@/lib/lead-sync';

export async function GET(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const client = await getWnsClient();
    const docs = await client
      .db(getWnsDbName())
      .collection('whatsappBatches')
      .find({ deletedAt: { $exists: false } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({
      status: 'connected',
      batches: docs.map(toBatchRecord),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Unable to load batches.',
        batches: [],
      },
      { status: 500 },
    );
  }
}
