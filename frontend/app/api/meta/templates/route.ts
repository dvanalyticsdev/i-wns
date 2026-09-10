import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import { getWnsClient, getWnsDbName } from '@/lib/lead-sync';

export async function GET(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const client = await getWnsClient();
    const docs = await client
      .db(getWnsDbName())
      .collection('whatsappTemplates')
      .find({})
      .sort({ status: 1, name: 1, language: 1 })
      .toArray();

    return NextResponse.json({
      status: 'connected',
      templates: docs.map((doc) => ({
        id: `${String(doc.name || '')}:${String(doc.language || 'en_US')}`,
        name: String(doc.name || ''),
        category: String(doc.category || 'Unknown'),
        body: extractBody(doc.components),
        mediaName: hasHeaderMedia(doc.components) ? 'Meta media header' : '',
        status: String(doc.status || 'UNKNOWN'),
        language: String(doc.language || 'en_US'),
        source: 'meta',
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to load Meta templates.',
        templates: [],
      },
      { status: 500 },
    );
  }
}

function extractBody(components: unknown) {
  if (!Array.isArray(components)) return '';
  const body = components.find(
    (component) =>
      typeof component === 'object' &&
      component !== null &&
      'type' in component &&
      String(component.type).toUpperCase() === 'BODY',
  );
  return body && 'text' in body ? String(body.text || '') : '';
}

function hasHeaderMedia(components: unknown) {
  if (!Array.isArray(components)) return false;
  return components.some(
    (component) =>
      typeof component === 'object' &&
      component !== null &&
      'type' in component &&
      String(component.type).toUpperCase() === 'HEADER' &&
      'format' in component &&
      String(component.format || '').toUpperCase() !== 'TEXT',
  );
}
