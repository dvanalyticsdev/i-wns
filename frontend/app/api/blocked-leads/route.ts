import { ObjectId, type Db } from 'mongodb';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import {
  leadHistoryCollection,
  normalizeLeadPhone,
} from '@/lib/lead-history';
import {
  getLeadCollectionName,
  getWnsClient,
  getWnsDbName,
} from '@/lib/lead-sync';

export async function GET(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const client = await getWnsClient();
    const docs = await leadHistoryCollection(client.db(getWnsDbName()))
      .find({ blockedAt: { $exists: true } })
      .sort({ blockedAt: -1 })
      .limit(1000)
      .toArray();

    return NextResponse.json({
      status: 'connected',
      blockedCount: docs.length,
      leads: docs.map((doc) => ({
        id: doc.normalizedPhone,
        name: doc.name || 'Blocked lead',
        company: doc.company || '-',
        phone: doc.phone || doc.normalizedPhone,
        city: doc.city || '-',
        source: 'Blocked leads',
        stage: 'Blocked',
        lastAction: doc.blockedAt
          ? `Blocked ${new Date(doc.blockedAt).toLocaleString('en-IN')}`
          : 'Blocked',
        status: 'Blocked',
        score: 0,
        messageCount: Number(doc.messageCount || 0),
        isBlocked: true,
        blockedAt: doc.blockedAt,
        blockedReason: doc.blockedReason || '',
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to load blocked leads.',
        leads: [],
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const body = (await request.json()) as {
      leadId?: string;
      phone?: string;
      name?: string;
      company?: string;
      city?: string;
      batchId?: string;
      reason?: string;
    };
    const client = await getWnsClient();
    const db = client.db(getWnsDbName());
    const lead = body.leadId ? await findLeadById(db, body.leadId) : null;
    const normalizedPhone = normalizeLeadPhone(
      body.phone || lead?.normalizedPhone || lead?.phone,
    );

    if (!normalizedPhone) {
      return NextResponse.json(
        { status: 'error', message: 'Phone number is required to block a lead.' },
        { status: 400 },
      );
    }

    const blockedAt = new Date();
    const name = String(body.name || lead?.name || lead?.fullName || '');
    const company = String(body.company || lead?.company || '');
    const city = String(body.city || lead?.city || '');
    await leadHistoryCollection(db).updateOne(
      { normalizedPhone },
      {
        $set: {
          normalizedPhone,
          phone: body.phone || lead?.phone || normalizedPhone,
          name,
          company,
          city,
          blockedAt,
          blockedReason: body.reason || 'Blocked from WNS',
          blockedFromBatchId: body.batchId || '',
          blockedFromLeadId: body.leadId || '',
          updatedAt: blockedAt,
        },
        $setOnInsert: {
          messageCount: 0,
          createdAt: blockedAt,
        },
        ...(body.leadId ? { $addToSet: { leadIds: body.leadId } } : {}),
      },
      { upsert: true },
    );

    const blockUpdate = {
      $set: {
        isBlocked: true,
        blockedAt,
        blockedReason: body.reason || 'Blocked from WNS',
        updatedAt: blockedAt,
      },
    };
    await Promise.all([
      db.collection(getLeadCollectionName()).updateMany(
        { normalizedPhone },
        blockUpdate,
      ),
      db.collection('excelLeads').updateMany({ normalizedPhone }, blockUpdate),
      body.batchId && ObjectId.isValid(body.batchId)
        ? db.collection('whatsappBatches').updateOne(
            { _id: new ObjectId(body.batchId) },
            {
              $addToSet: { blockedLeadIds: body.leadId || normalizedPhone },
              $set: { updatedAt: blockedAt },
            },
          )
        : Promise.resolve(),
    ]);

    return NextResponse.json({
      status: 'blocked',
      normalizedPhone,
      blockedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Unable to block lead.',
      },
      { status: 500 },
    );
  }
}

async function findLeadById(db: Db, leadId: string) {
  return (
    (await db.collection(getLeadCollectionName()).findOne({ crmLeadId: leadId })) ||
    (await db.collection('excelLeads').findOne({ crmLeadId: leadId }))
  );
}
