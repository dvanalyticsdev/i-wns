import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const COOKIE_NAME = 'i_wns_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export function createSessionResponse() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, signSession(Date.now()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}

export function clearSessionResponse() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export function isAuthenticated(request: NextRequest) {
  const session = request.cookies.get(COOKIE_NAME)?.value || '';
  const [createdAtValue, signature] = session.split('.');
  const createdAt = Number(createdAtValue);
  if (!createdAt || !signature) {
    return false;
  }
  if (Date.now() - createdAt > SESSION_TTL_MS) {
    return false;
  }
  const expected = sign(createdAt);
  return safeEqual(signature, expected);
}

export function unauthorizedResponse() {
  return NextResponse.json(
    {
      status: 'unauthorized',
      message: 'Passcode required.',
      archiveCount: 0,
      leads: [],
    },
    { status: 401 },
  );
}

function signSession(createdAt: number) {
  return `${createdAt}.${sign(createdAt)}`;
}

function sign(createdAt: number) {
  return crypto
    .createHmac('sha256', getSecret())
    .update(String(createdAt))
    .digest('base64url');
}

function getSecret() {
  return process.env.I_WNS_AUTH_SECRET || 'local-i-wns-development-secret';
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
