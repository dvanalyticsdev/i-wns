import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import { getWnsClient, getWnsDbName } from '@/lib/lead-sync';

type Params = {
  params: Promise<{ batchId: string }>;
};

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const { batchId } = await params;
    if (!ObjectId.isValid(batchId)) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid batch id.' },
        { status: 400 },
      );
    }

    const client = await getWnsClient();
    const db = client.db(getWnsDbName());
    const batchObjectId = new ObjectId(batchId);
    const deletedAt = new Date();

    const result = await db.collection('whatsappBatches').findOneAndUpdate(
      { _id: batchObjectId, deletedAt: { $exists: false } },
      {
        $set: {
          deletedAt,
          updatedAt: deletedAt,
        },
      },
      { returnDocument: 'after' },
    );

    if (!result) {
      return NextResponse.json(
        { status: 'error', message: 'Batch not found.' },
        { status: 404 },
      );
    }

    await db.collection('whatsappMessages').updateMany(
      { batchId: batchObjectId, deletedAt: { $exists: false } },
      {
        $set: {
          deletedAt,
          updatedAt: deletedAt,
        },
      },
    );

    return NextResponse.json({
      status: 'deleted',
      batchId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Unable to delete report.',
      },
      { status: 500 },
    );
  }
}
