import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  getLeadCollectionName,
  getWnsClient,
  getWnsDbName,
} from '@/lib/lead-sync';
import { getMetaConfig } from '@/lib/meta-whatsapp';

type WhatsAppStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: unknown[];
};

type WhatsAppInboundMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};

export async function GET(request: NextRequest) {
  const config = getMetaConfig();
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && token === config.webhookVerifyToken) {
    return new Response(challenge || '', { status: 200 });
  }

  return new Response('Webhook verification failed.', { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (!isValidMetaSignature(request, rawBody)) {
      return new Response('Invalid signature.', { status: 403 });
    }

    const payload = JSON.parse(rawBody);
    const client = await getWnsClient();
    const db = client.db(getWnsDbName());
    const receivedAt = new Date();

    await db.collection('whatsappWebhookEvents').insertOne({
      payload,
      receivedAt,
    });

    const changes = extractChanges(payload);
    for (const change of changes) {
      await applyStatuses(change.statuses, receivedAt);
      await applyReplies(change.messages, receivedAt);
    }

    return NextResponse.json({ status: 'received' });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to process WhatsApp webhook.',
      },
      { status: 500 },
    );
  }
}

function isValidMetaSignature(request: NextRequest, rawBody: string) {
  const appSecret = getMetaConfig().appSecret;
  if (!appSecret) {
    return true;
  }

  const signature = request.headers.get('x-hub-signature-256') || '';
  if (!signature.startsWith('sha256=')) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function extractChanges(payload: {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: WhatsAppStatus[];
        messages?: WhatsAppInboundMessage[];
      };
    }>;
  }>;
}) {
  return (payload.entry || [])
    .flatMap((entry) => entry.changes || [])
    .map((change) => ({
      statuses: change.value?.statuses || [],
      messages: change.value?.messages || [],
    }));
}

async function applyStatuses(statuses: WhatsAppStatus[], receivedAt: Date) {
  if (!statuses.length) return;

  const client = await getWnsClient();
  const db = client.db(getWnsDbName());
  const messages = db.collection('whatsappMessages');
  const batches = db.collection('whatsappBatches');

  for (const statusEvent of statuses) {
    const wamid = statusEvent.id;
    if (!wamid) continue;

    const message = await messages.findOneAndUpdate(
      { wamid, deletedAt: { $exists: false } },
      {
        $set: {
          status: statusEvent.status || 'unknown',
          statusTimestamp: statusEvent.timestamp,
          recipientId: statusEvent.recipient_id,
          errors: statusEvent.errors || [],
          updatedAt: receivedAt,
        },
      },
      { returnDocument: 'after' },
    );

    if (!message?.batchId || !message.leadId) continue;

    const addToSet: Record<string, string> = {};
    if (statusEvent.status === 'delivered') {
      addToSet.deliveredLeadIds = message.leadId;
    }
    if (statusEvent.status === 'read') {
      addToSet.deliveredLeadIds = message.leadId;
      addToSet.readLeadIds = message.leadId;
    }
    if (statusEvent.status === 'failed') {
      addToSet.failedLeadIds = message.leadId;
    }

    if (Object.keys(addToSet).length) {
      await batches.updateOne(
        {
          _id: new ObjectId(String(message.batchId)),
          deletedAt: { $exists: false },
        },
        {
          $addToSet: addToSet,
          $set: { updatedAt: receivedAt },
        },
      );
    }
  }
}

async function applyReplies(messages: WhatsAppInboundMessage[], receivedAt: Date) {
  if (!messages.length) return;

  const client = await getWnsClient();
  const db = client.db(getWnsDbName());
  const replies = db.collection('whatsappReplies');
  const batches = db.collection('whatsappBatches');
  const leads = db.collection(getLeadCollectionName());

  for (const inbound of messages) {
    const from = inbound.from || '';
    const lead = await leads.findOne({
      $or: [
        { normalizedPhone: from },
        { phone: from },
        { phone: new RegExp(`${escapeRegex(from)}$`) },
      ],
    });
    await replies.updateOne(
      { wamid: inbound.id },
      {
        $set: {
          wamid: inbound.id,
          from,
          leadId: lead?.crmLeadId || null,
          type: inbound.type || 'unknown',
          text: inbound.text?.body || '',
          timestamp: inbound.timestamp,
          receivedAt,
        },
      },
      { upsert: true },
    );

    if (lead?.crmLeadId) {
      const latestMessage = await db.collection('whatsappMessages').findOne(
        { leadId: lead.crmLeadId, deletedAt: { $exists: false } },
        { sort: { createdAt: -1 } },
      );
      if (latestMessage?.batchId) {
        await batches.updateOne(
          {
            _id: new ObjectId(String(latestMessage.batchId)),
            deletedAt: { $exists: false },
          },
          {
            $addToSet: { repliedLeadIds: lead.crmLeadId },
            $set: { updatedAt: receivedAt },
          },
        );
      }
    }
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
