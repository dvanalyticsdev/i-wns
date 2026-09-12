import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import { toBatchRecord } from '@/lib/batches';
import { getWnsClient, getWnsDbName } from '@/lib/lead-sync';

type Params = {
  params: Promise<{ batchId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const { batchId } = await params;
    const body = (await request.json()) as {
      leadId?: string;
      shared?: boolean;
    };
    if (!ObjectId.isValid(batchId) || !body.leadId) {
      return NextResponse.json(
        { status: 'error', message: 'Batch and lead are required.' },
        { status: 400 },
      );
    }

    const client = await getWnsClient();
    const collection = client.db(getWnsDbName()).collection('whatsappBatches');
    const update =
      body.shared === false
        ? { $pull: { sharedLeadIds: body.leadId } }
        : { $addToSet: { sharedLeadIds: body.leadId } };

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(batchId), deletedAt: { $exists: false } },
      {
        ...update,
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' },
    );

    if (!result) {
      return NextResponse.json(
        { status: 'error', message: 'Batch not found.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      status: 'updated',
      batch: toBatchRecord(result),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Unable to update sharing.',
      },
      { status: 500 },
    );
  }
}
