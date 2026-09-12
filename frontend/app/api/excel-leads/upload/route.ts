import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';

import { isAuthenticated, unauthorizedResponse } from '@/lib/auth';
import { getWnsClient, getWnsDbName } from '@/lib/lead-sync';

const MAX_EXCEL_LEADS = 5000;

type ParsedLead = {
  crmLeadId: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  company: string;
  city: string;
  source: string;
  stage: string;
  lastAction: string;
  status: string;
  score: number;
};

export async function POST(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { status: 'error', message: 'Upload an .xlsx file.' },
        { status: 400 },
      );
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json(
        { status: 'error', message: 'Only .xlsx files are supported.' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
    if (!worksheet) {
      return NextResponse.json(
        { status: 'error', message: 'The uploaded workbook is empty.' },
        { status: 400 },
      );
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
    });
    const importId = new ObjectId();
    const importedAt = new Date();
    const leads = parseLeads(rows, importId);
    if (!leads.length) {
      return NextResponse.json(
        {
          status: 'error',
          message:
            'No valid leads found. The file must include name and phone columns.',
        },
        { status: 400 },
      );
    }

    const client = await getWnsClient();
    const db = client.db(getWnsDbName());
    await db.collection('excelLeadImports').insertOne({
      _id: importId,
      fileName: file.name,
      sheetName: firstSheetName,
      totalRows: rows.length,
      validRows: leads.length,
      importedAt,
    });
    await db.collection('excelLeads').insertMany(
      leads.map((lead, index) => ({
        ...lead,
        importId,
        rowNumber: index + 2,
        importedAt,
      })),
    );

    return NextResponse.json({
      status: 'uploaded',
      importId: importId.toString(),
      fileName: file.name,
      totalRows: rows.length,
      validRows: leads.length,
      leads: leads.map(toClientLead),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to upload Excel leads.',
      },
      { status: 500 },
    );
  }
}

function parseLeads(rows: Record<string, unknown>[], importId: ObjectId) {
  const seenPhones = new Set<string>();
  const leads: ParsedLead[] = [];
  for (const row of rows) {
    if (leads.length >= MAX_EXCEL_LEADS) break;
    const name = pickColumn(row, ['name', 'full name', 'fullname']);
    const phone = pickColumn(row, [
      'phone',
      'phone number',
      'mobile',
      'whatsapp',
      'whatsapp number',
    ]);
    const normalizedPhone = normalizePhone(phone);
    if (!name || !normalizedPhone || seenPhones.has(normalizedPhone)) continue;
    seenPhones.add(normalizedPhone);
    leads.push({
      crmLeadId: `excel-${importId.toString()}-${leads.length + 1}`,
      name,
      phone: normalizedPhone,
      normalizedPhone,
      company: 'Excel upload',
      city: 'Uploaded file',
      source: 'Excel upload',
      stage: 'Uploaded',
      lastAction: 'Uploaded from Excel',
      status: 'Ready',
      score: 50,
    });
  }
  return leads;
}

function pickColumn(row: Record<string, unknown>, candidates: string[]) {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  );
  for (const candidate of candidates) {
    const value = normalized.get(normalizeHeader(candidate));
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizePhone(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function toClientLead(lead: ParsedLead) {
  return {
    id: lead.crmLeadId,
    name: lead.name,
    company: lead.company,
    phone: lead.phone,
    city: lead.city,
    source: lead.source,
    stage: lead.stage,
    lastAction: lead.lastAction,
    status: lead.status,
    score: lead.score,
  };
}
