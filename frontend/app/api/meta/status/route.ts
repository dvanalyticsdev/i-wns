import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import { getMetaConfigStatus } from '@/lib/meta-whatsapp';

export async function GET(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return unauthorizedResponse();
  }

  return NextResponse.json({
    status: 'ok',
    ...getMetaConfigStatus(),
    webhookUrl: buildWebhookUrl(request),
    requiredEnv: [
      'META_WHATSAPP_ACCESS_TOKEN',
      'META_WHATSAPP_PHONE_NUMBER_ID',
      'META_WHATSAPP_WABA_ID',
      'META_WEBHOOK_VERIFY_TOKEN',
      'META_APP_SECRET',
    ],
  });
}

function buildWebhookUrl(request: NextRequest) {
  const baseUrl =
    process.env.APP_PUBLIC_BASE_URL ||
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  return `${baseUrl.replace(/\/$/, '')}/api/webhooks/whatsapp`;
}
