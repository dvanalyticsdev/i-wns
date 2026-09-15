import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import { toBatchRecord } from '@/lib/batches';
import {
  applyLeadHistory,
  getLeadHistoryMap,
  normalizeLeadPhone,
  upsertLeadHistories,
} from '@/lib/lead-history';
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
  templateCategory?: string;
  languageCode?: string;
  leadIds?: string[];
  leadSource?: 'crm' | 'excel';
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
    const templateCategory = body.templateCategory?.trim() || '';
    const languageCode = body.languageCode?.trim() || 'en_US';
    const leadSource = body.leadSource === 'excel' ? 'excel' : 'crm';

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
    const leadCollectionName =
      leadSource === 'excel' ? 'excelLeads' : getLeadCollectionName();
    const matchedLeads = await db
      .collection<SyncedLeadDocument>(
        leadCollectionName,
      )
      .find({ crmLeadId: { $in: leadIds } })
      .toArray();
    const historyByPhone = await getLeadHistoryMap(
      db,
      matchedLeads.map((lead) => lead.normalizedPhone || lead.phone),
    );
    const seenPhones = new Set<string>();
    const leads = matchedLeads
      .map((lead) =>
        applyLeadHistory(
          lead,
          historyByPhone.get(normalizeLeadPhone(lead.normalizedPhone || lead.phone)),
        ),
      )
      .filter((lead) => {
        const normalizedPhone = normalizeLeadPhone(
          lead.normalizedPhone || lead.phone,
        );
        if (!normalizedPhone || lead.isBlocked || seenPhones.has(normalizedPhone)) {
          return false;
        }
        seenPhones.add(normalizedPhone);
        return true;
      })
      .sort(
        (left, right) =>
          left.messageCount - right.messageCount ||
          String(left.name || '').localeCompare(String(right.name || '')),
      );

    if (!leads.length) {
      return NextResponse.json(
        {
          status: 'error',
          message:
            'No eligible leads remain after blocked and duplicate checks.',
        },
        { status: 400 },
      );
    }

    const now = new Date();
    const batchId = new ObjectId();
    const batches = db.collection('whatsappBatches');
    const messages = db.collection('whatsappMessages');

    await batches.insertOne({
      _id: batchId,
      name: batchName,
      templateName,
      templateId: body.templateId || templateName,
      templateCategory,
      languageCode,
      leadSource,
      requestedLeadIds: leadIds,
      leadIds: leads.map((lead) => lead.crmLeadId),
      deliveredLeadIds: [],
      readLeadIds: [],
      clickedLeadIds: [],
      repliedLeadIds: [],
      convertedLeadIds: [],
      sharedLeadIds: [],
      status: 'sending',
      requestedCount: leadIds.length,
      createdAt: now,
      updatedAt: now,
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const lead of leads) {
      const sentAt = new Date();
      const normalizedPhone = normalizeLeadPhone(
        lead.normalizedPhone || lead.phone,
      );
      try {
        const providerResponse = await sendTemplateMessage({
          to: normalizedPhone,
          templateName,
          languageCode,
          bodyParameters: body.bodyParameters,
        });
        const wamid = providerResponse.messages?.[0]?.id || '';
        await messages.insertOne({
          batchId,
          leadId: lead.crmLeadId,
          to: normalizedPhone,
          normalizedPhone,
          wamid,
          templateName,
          languageCode,
          status: 'sent',
          providerResponse,
          createdAt: sentAt,
          updatedAt: sentAt,
        });
        await upsertLeadHistories(db, [lead], {
          batchId: batchId.toString(),
          sentAt,
        });
        await db.collection(leadCollectionName).updateMany(
          { normalizedPhone },
          {
            $inc: { messageCount: 1 },
            $set: { lastSentAt: sentAt, reachedOut: true, updatedAt: sentAt },
            $addToSet: { batchIds: batchId.toString() },
          },
        );
        sentCount += 1;
      } catch (error) {
        await messages.insertOne({
          batchId,
          leadId: lead.crmLeadId,
          to: normalizedPhone,
          normalizedPhone,
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
          delivered: 0,
          failed: failedCount,
          read: 0,
          clicks: 0,
          replies: 0,
          converted: 0,
          shared: 0,
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
      matchedLeadCount: matchedLeads.length,
      eligibleLeadCount: leads.length,
      skippedLeadCount: Math.max(matchedLeads.length - leads.length, 0),
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
