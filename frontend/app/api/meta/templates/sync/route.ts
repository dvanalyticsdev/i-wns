import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import { getWnsClient, getWnsDbName } from '@/lib/lead-sync';
import { getMetaConfig, listMetaTemplates } from '@/lib/meta-whatsapp';

export async function POST(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const config = getMetaConfig();
    const templates = await listMetaTemplates();
    const client = await getWnsClient();
    const collection = client.db(getWnsDbName()).collection('whatsappTemplates');
    const syncedAt = new Date();

    if (templates.length) {
      await collection.bulkWrite(
        templates.map((template) => ({
          updateOne: {
            filter: {
              wabaId: config.wabaId,
              name: template.name,
              language: template.language,
            },
            update: {
              $set: {
                ...template,
                wabaId: config.wabaId,
                metaTemplateId: template.id,
                syncedAt,
              },
              $setOnInsert: {
                createdAt: syncedAt,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    const staleDeleteResult = await collection.deleteMany({
      $or: [
        { wabaId: { $ne: config.wabaId } },
        templates.length
          ? {
              wabaId: config.wabaId,
              $nor: templates.map((template) => ({
                name: template.name,
                language: template.language,
              })),
            }
          : { wabaId: config.wabaId },
      ],
    });

    return NextResponse.json({
      status: 'synced',
      syncedCount: templates.length,
      removedStaleCount: staleDeleteResult.deletedCount,
      syncedAt: syncedAt.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to sync Meta templates.',
      },
      { status: 500 },
    );
  }
}
