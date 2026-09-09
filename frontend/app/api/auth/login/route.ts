import { NextRequest, NextResponse } from 'next/server';

import { createSessionResponse } from '@/lib/auth';

const PASSCODE = '2817';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    passcode?: unknown;
  } | null;

  if (typeof body?.passcode !== 'string' || body.passcode !== PASSCODE) {
    return NextResponse.json(
      { ok: false, message: 'Incorrect passcode.' },
      { status: 401 },
    );
  }

  return createSessionResponse();
}
