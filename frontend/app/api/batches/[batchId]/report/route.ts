import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import { toBatchRecord } from '@/lib/batches';
import {
  getLeadCollectionName,
  getWnsClient,
  getWnsDbName,
  toArchiveLead,
} from '@/lib/lead-sync';

const PAGE_SIZE = 100;

type Params = {
  params: Promise<{ batchId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
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

    const url = new URL(request.url);
    const page = Math.max(Number(url.searchParams.get('page') || '1'), 1);
    const action = url.searchParams.get('action') || 'all';
    const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
    const skip = (page - 1) * PAGE_SIZE;

    const client = await getWnsClient();
    const db = client.db(getWnsDbName());
    const batchDoc = await db
      .collection('whatsappBatches')
      .findOne({ _id: new ObjectId(batchId), deletedAt: { $exists: false } });

    if (!batchDoc) {
      return NextResponse.json(
        { status: 'error', message: 'Batch not found.' },
        { status: 404 },
      );
    }

    const batch = toBatchRecord(batchDoc);
    const messages = await db
      .collection('whatsappMessages')
      .find({ batchId: batchDoc._id, deletedAt: { $exists: false } })
      .sort({ createdAt: -1 })
      .toArray();
    const messageByLead = new Map(
      messages.map((message) => [String(message.leadId), message]),
    );
    const replies = await db
      .collection('whatsappReplies')
      .find({ leadId: { $in: batch.leadIds } })
      .sort({ receivedAt: -1 })
      .toArray();
    const repliesByLead = new Map<string, typeof replies>();
    for (const reply of replies) {
      const leadId = String(reply.leadId || '');
      if (!leadId) continue;
      repliesByLead.set(leadId, [...(repliesByLead.get(leadId) || []), reply]);
    }

    const leadSource = String(batchDoc.leadSource || 'crm');
    const leads = await db
      .collection(leadSource === 'excel' ? 'excelLeads' : getLeadCollectionName())
      .find({ crmLeadId: { $in: batch.leadIds } })
      .toArray();
    const leadsById = new Map(
      leads.map((lead) => [String(lead.crmLeadId), toArchiveLead(lead)]),
    );

    const rows = batch.leadIds.map((leadId) => {
      const lead =
        leadsById.get(leadId) ||
        toArchiveLead({ crmLeadId: leadId, name: 'Unknown lead' });
      const message = messageByLead.get(leadId);
      const leadReplies = repliesByLead.get(leadId) || [];
      return {
        lead,
        messageStatus: String(message?.status || 'not_sent'),
        metaMessageId: String(message?.wamid || ''),
        error:
          String(message?.error || '') ||
          extractError(message?.errors) ||
          extractError(message?.providerResponse?.error),
        delivered: (batch.deliveredLeadIds || []).includes(leadId),
        read: (batch.readLeadIds || []).includes(leadId),
        clicked: (batch.clickedLeadIds || []).includes(leadId),
        replied: (batch.repliedLeadIds || []).includes(leadId),
        converted: (batch.convertedLeadIds || []).includes(leadId),
        shared: (batch.sharedLeadIds || []).includes(leadId),
        replies: leadReplies.map((reply) => ({
          text: String(reply.text || ''),
          receivedAt: reply.receivedAt,
          type: String(reply.type || 'unknown'),
        })),
      };
    });

    const filteredRows = rows
      .filter((row) => matchesAction(row, action))
      .filter((row) => {
        if (!search) return true;
        return [
          row.lead.name,
          row.lead.phone,
          row.lead.city,
          row.lead.company,
          row.messageStatus,
          row.error,
          ...row.replies.map((reply) => reply.text),
        ]
          .join(' ')
          .toLowerCase()
          .includes(search);
      });

    return NextResponse.json({
      status: 'connected',
      batch,
      totals: {
        requested: batch.leadIds.length,
        sent: batch.sent,
        delivered: batch.delivered,
        failed: batch.failed,
        read: batch.read,
        clicked: batch.clicks,
        replied: batch.replies,
        converted: batch.converted,
        shared: batch.shared,
      },
      page,
      limit: PAGE_SIZE,
      totalRows: filteredRows.length,
      totalPages: Math.max(Math.ceil(filteredRows.length / PAGE_SIZE), 1),
      rows: filteredRows.slice(skip, skip + PAGE_SIZE),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to load batch report.',
      },
      { status: 500 },
    );
  }
}

function matchesAction(
  row: {
    messageStatus: string;
    delivered: boolean;
    read: boolean;
    clicked: boolean;
    replied: boolean;
    converted: boolean;
    shared: boolean;
  },
  action: string,
) {
  if (action === 'all') return true;
  if (action === 'sent') return row.messageStatus === 'sent';
  if (action === 'failed') return row.messageStatus === 'failed';
  if (action === 'read') return row.read;
  if (action === 'clicked') return row.clicked;
  if (action === 'replied') return row.replied;
  if (action === 'converted') return row.converted;
  if (action === 'not-opened') return row.messageStatus === 'sent' && !row.read;
  return true;
}

function extractError(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(extractError).filter(Boolean).join('; ');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(
      record.message ||
        record.title ||
        (record.error_data as Record<string, unknown> | undefined)?.details ||
        '',
    );
  }
  return '';
}
