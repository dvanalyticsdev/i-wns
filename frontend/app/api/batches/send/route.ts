import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import { toBatchRecord } from '@/lib/batches';
import {
  getLeadCollectionName,
  getWnsClient,
  getWnsDbName,
  type SyncedLeadDocument,
} from '@/lib/lead-sync';
import { getMetaConfigStatus, sendTemplateMessage } from '@/lib/meta-whatsapp';

const MAX_SEND_PER_REQUEST = 1000;

type SendBatchRequest = {
  name?: string;
  templateName?: string;
  templateId?: string;
  languageCode?: string;
  leadIds?: string[];
  bodyParameters?: string[];
};

export async function POST(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const body = (await request.json()) as SendBatchRequest;
    const leadIds = Array.from(new Set(body.leadIds || []))
      .filter(Boolean)
      .slice(0, MAX_SEND_PER_REQUEST);
    const batchName = body.name?.trim();
    const templateName = body.templateName?.trim() || body.templateId?.trim();
    const languageCode = body.languageCode?.trim() || 'en_US';

    if (!batchName || !templateName || !leadIds.length) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Batch name, template, and leads are required.',
        },
        { status: 400 },
      );
    }

    if (!getMetaConfigStatus().configured) {
      return NextResponse.json(
        {
          status: 'missing_config',
          message:
            'Meta WhatsApp API is not configured yet. Add access token, phone number ID, and WABA ID before sending.',
        },
        { status: 503 },
      );
    }

    const client = await getWnsClient();
    const db = client.db(getWnsDbName());
    const leads = await db
      .collection<SyncedLeadDocument>(getLeadCollectionName())
      .find({ crmLeadId: { $in: leadIds } })
      .toArray();

    const now = new Date();
    const batchId = new ObjectId();
    const batches = db.collection('whatsappBatches');
    const messages = db.collection('whatsappMessages');

    await batches.insertOne({
      _id: batchId,
      name: batchName,
      templateName,
      templateId: body.templateId || templateName,
      languageCode,
      requestedLeadIds: leadIds,
      leadIds: leads.map((lead) => lead.crmLeadId),
      readLeadIds: [],
      clickedLeadIds: [],
      repliedLeadIds: [],
      convertedLeadIds: [],
      status: 'sending',
      requestedCount: leadIds.length,
      createdAt: now,
      updatedAt: now,
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const lead of leads) {
      const sentAt = new Date();
      try {
        const providerResponse = await sendTemplateMessage({
          to: lead.phone,
          templateName,
          languageCode,
          bodyParameters: body.bodyParameters,
        });
        const wamid = providerResponse.messages?.[0]?.id || '';
        await messages.insertOne({
          batchId,
          leadId: lead.crmLeadId,
          to: lead.phone,
          wamid,
          templateName,
          languageCode,
          status: 'sent',
          providerResponse,
          createdAt: sentAt,
          updatedAt: sentAt,
        });
        sentCount += 1;
      } catch (error) {
        await messages.insertOne({
          batchId,
          leadId: lead.crmLeadId,
          to: lead.phone,
          templateName,
          languageCode,
          status: 'failed',
          error:
            error instanceof Error ? error.message : 'WhatsApp send failed.',
          createdAt: sentAt,
          updatedAt: sentAt,
        });
        failedCount += 1;
      }
    }

    const finalStatus = sentCount ? 'sent' : 'failed';
    await batches.updateOne(
      { _id: batchId },
      {
        $set: {
          status: finalStatus,
          sent: sentCount,
          failed: failedCount,
          read: 0,
          clicks: 0,
          replies: 0,
          converted: 0,
          updatedAt: new Date(),
        },
      },
    );
    const batch = await batches.findOne({ _id: batchId });

    return NextResponse.json({
      status: finalStatus,
      batchId: batchId.toString(),
      batch: batch ? toBatchRecord(batch) : null,
      requestedCount: leadIds.length,
      matchedLeadCount: leads.length,
      sentCount,
      failedCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Unable to send batch.',
      },
      { status: 500 },
    );
  }
}
