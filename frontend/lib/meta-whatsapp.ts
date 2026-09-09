import type { Document } from 'mongodb';

export type MetaTemplate = {
  id?: string;
  name: string;
  status?: string;
  category?: string;
  language?: string;
  components?: Document[];
  quality_score?: Document;
};

export type SendTemplateMessageInput = {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParameters?: string[];
  headerImageId?: string;
  headerDocumentId?: string;
  headerVideoId?: string;
};

export function getMetaConfig() {
  return {
    accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || '',
    wabaId: process.env.META_WHATSAPP_WABA_ID || '',
    graphVersion: process.env.META_GRAPH_VERSION || 'v23.0',
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || '',
    appSecret: process.env.META_APP_SECRET || '',
  };
}

export function getMetaConfigStatus() {
  const config = getMetaConfig();
  return {
    configured: Boolean(
      config.accessToken && config.phoneNumberId && config.wabaId,
    ),
    webhookReady: Boolean(config.webhookVerifyToken),
    signatureCheckReady: Boolean(config.appSecret),
    graphVersion: config.graphVersion,
    phoneNumberId: mask(config.phoneNumberId),
    wabaId: mask(config.wabaId),
  };
}

export async function listMetaTemplates() {
  const config = getMetaConfig();
  requireMetaConfig(['accessToken', 'wabaId']);
  const url = new URL(
    `https://graph.facebook.com/${config.graphVersion}/${config.wabaId}/message_templates`,
  );
  url.searchParams.set(
    'fields',
    'id,name,status,category,language,components,quality_score',
  );
  url.searchParams.set('limit', '250');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
    },
  });
  const data = (await response.json()) as {
    data?: MetaTemplate[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || 'Unable to load Meta templates.');
  }
  return data.data || [];
}

export async function sendTemplateMessage(input: SendTemplateMessageInput) {
  const config = getMetaConfig();
  requireMetaConfig(['accessToken', 'phoneNumberId']);
  const response = await fetch(
    `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizePhone(input.to),
        type: 'template',
        template: buildTemplatePayload(input),
      }),
    },
  );
  const data = (await response.json()) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || 'Unable to send WhatsApp message.');
  }
  return data;
}

function buildTemplatePayload(input: SendTemplateMessageInput) {
  const components = [];
  if (input.headerImageId) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { id: input.headerImageId } }],
    });
  }
  if (input.headerDocumentId) {
    components.push({
      type: 'header',
      parameters: [
        { type: 'document', document: { id: input.headerDocumentId } },
      ],
    });
  }
  if (input.headerVideoId) {
    components.push({
      type: 'header',
      parameters: [{ type: 'video', video: { id: input.headerVideoId } }],
    });
  }
  if (input.bodyParameters?.length) {
    components.push({
      type: 'body',
      parameters: input.bodyParameters.map((text) => ({ type: 'text', text })),
    });
  }
  return {
    name: input.templateName,
    language: { code: input.languageCode || 'en_US' },
    ...(components.length ? { components } : {}),
  };
}

function requireMetaConfig(keys: Array<'accessToken' | 'phoneNumberId' | 'wabaId'>) {
  const config = getMetaConfig();
  const missing = keys.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Missing Meta WhatsApp config: ${missing.join(', ')}.`);
  }
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, '');
}

function mask(value: string) {
  if (!value) return '';
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}
