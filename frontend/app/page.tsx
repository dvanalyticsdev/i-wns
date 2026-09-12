'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  Archive,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  FileSpreadsheet,
  LayoutDashboard,
  Lock,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { BatchRecord } from '@/lib/batches';

type ViewId =
  | 'dashboard'
  | 'templates'
  | 'reachout'
  | 'reporting'
  | 'sync'
  | 'settings';

type ArchiveLead = {
  id: string;
  name: string;
  company: string;
  phone: string;
  city: string;
  source: string;
  stage: string;
  lastAction: string;
  status: string;
  score: number;
};

type ArchiveResponse = {
  status: 'idle' | 'loading' | 'connected' | 'missing_config' | 'error';
  message?: string;
  archiveCount: number;
  filteredCount?: number;
  leads: ArchiveLead[];
  page?: number;
  limit?: number;
  totalPages?: number;
  cities?: string[];
  courses?: string[];
  collection?: string;
  database?: string;
  archiveRule?: string;
  lastSyncedAt?: string | null;
};

type SyncResult = {
  syncedCount?: number;
  storedCount?: number;
  removedStaleCount?: number;
  syncedAt?: string;
  message?: string;
};

type BatchListResponse = {
  batches?: BatchRecord[];
  message?: string;
};

type SendBatchResponse = {
  status?: string;
  batch?: BatchRecord;
  sentCount?: number;
  failedCount?: number;
  message?: string;
};

type MetaStatus = {
  configured: boolean;
  webhookReady: boolean;
  signatureCheckReady: boolean;
  graphVersion: string;
  phoneNumberId: string;
  wabaId: string;
  webhookUrl: string;
  requiredEnv: string[];
};

type TemplateRecord = {
  id: string;
  name: string;
  category: string;
  body: string;
  mediaName: string;
  status: string;
  language?: string;
  source?: 'draft' | 'meta';
};

type ReportActionFilter =
  | 'all'
  | 'sent'
  | 'failed'
  | 'read'
  | 'clicked'
  | 'replied'
  | 'converted'
  | 'not-opened';

type ReportLeadRow = {
  lead: ArchiveLead;
  messageStatus: string;
  metaMessageId: string;
  error: string;
  read: boolean;
  clicked: boolean;
  replied: boolean;
  converted: boolean;
  replies: Array<{ text: string; receivedAt?: string; type: string }>;
};

type BatchReportResponse = {
  status?: string;
  message?: string;
  batch?: BatchRecord;
  totals?: {
    requested: number;
    sent: number;
    failed: number;
    read: number;
    clicked: number;
    replied: number;
    converted: number;
  };
  page?: number;
  limit?: number;
  totalRows?: number;
  totalPages?: number;
  rows?: ReportLeadRow[];
};

const emptyArchive: ArchiveResponse = {
  status: 'idle',
  archiveCount: 0,
  leads: [],
};

const storageKeys = {
  templates: 'i-wns-templates',
  batches: 'i-wns-batches',
};

function readStoredRecords<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function readInitialReportId() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('report') || '';
}

const navItems: Array<{ id: ViewId; label: string; icon: LucideIcon }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'templates', label: 'Templates', icon: ClipboardList },
  { id: 'reachout', label: 'Reach Out', icon: Send },
  { id: 'reporting', label: 'Reporting', icon: BarChart3 },
  { id: 'sync', label: 'CRM Sync', icon: RefreshCw },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Home() {
  const [authStatus, setAuthStatus] = useState<
    'checking' | 'authenticated' | 'locked'
  >('checking');
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState('');
  const initialReportId = readInitialReportId();
  const [activeView, setActiveView] = useState<ViewId>(
    initialReportId ? 'reporting' : 'dashboard',
  );
  const [archive, setArchive] = useState<ArchiveResponse>({
    ...emptyArchive,
    status: 'loading',
  });
  const [, setNotice] = useState('Loading CRM archive.');
  const [templates, setTemplates] = useState<TemplateRecord[]>(() =>
    readStoredRecords<TemplateRecord>(storageKeys.templates),
  );
  const [metaTemplates, setMetaTemplates] = useState<TemplateRecord[]>([]);
  const [batches, setBatches] = useState<BatchRecord[]>(() =>
    readStoredRecords<BatchRecord>(storageKeys.batches),
  );
  const [selectedReportId, setSelectedReportId] = useState(initialReportId);

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      try {
        const response = await fetch('/api/auth/session', {
          cache: 'no-store',
        });
        const data = (await response.json()) as { authenticated?: boolean };
        if (!cancelled) {
          setAuthStatus(data.authenticated ? 'authenticated' : 'locked');
        }
      } catch {
        if (!cancelled) {
          setAuthStatus('locked');
        }
      }
    }
    void checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        storageKeys.templates,
        JSON.stringify(templates),
      );
    }
  }, [templates]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.batches, JSON.stringify(batches));
    }
  }, [batches]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    let cancelled = false;
    async function loadArchive() {
      setArchive((current) => ({ ...current, status: 'loading' }));
      try {
        const response = await fetch('/api/archive-leads', {
          cache: 'no-store',
        });
        const data = (await response.json()) as ArchiveResponse;
        if (cancelled) return;
        if (response.status === 401) {
          setAuthStatus('locked');
          setNotice('Passcode required.');
          return;
        }
        setArchive(data);
        setNotice(
          response.ok
            ? `${data.archiveCount.toLocaleString()} archived leads loaded from CRM.`
            : data.message || 'CRM connection is not configured yet.',
        );
      } catch {
        if (!cancelled) {
          setArchive({
            ...emptyArchive,
            status: 'error',
            message: 'Unable to reach the archive lead API.',
          });
          setNotice('Unable to reach the archive lead API.');
        }
      }
    }
    void loadArchive();
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    let cancelled = false;
    async function loadMetaTemplates() {
      try {
        const response = await fetch('/api/meta/templates', {
          cache: 'no-store',
        });
        const data = (await response.json()) as {
          templates?: TemplateRecord[];
        };
        if (!cancelled && response.ok) {
          setMetaTemplates(data.templates || []);
        }
      } catch {
        // Template sync can be triggered manually from the Templates page.
      }
    }
    void loadMetaTemplates();
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    let cancelled = false;
    async function loadBatches() {
      try {
        const response = await fetch('/api/batches', { cache: 'no-store' });
        const data = (await response.json()) as BatchListResponse;
        if (!cancelled && response.ok) {
          setBatches(data.batches || []);
        }
      } catch {
        // Browser-stored batches stay visible if the backend is unavailable.
      }
    }
    void loadBatches();
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  async function loadArchivePage({
    page = 1,
    cities = [],
    courses = [],
    search = '',
    silent = false,
  }: {
    page?: number;
    cities?: string[];
    courses?: string[];
    search?: string;
    silent?: boolean;
  } = {}) {
    setArchive((current) => ({ ...current, status: 'loading' }));
    const params = new URLSearchParams({
      page: String(page),
      limit: '100',
      search,
    });
    if (cities.length) {
      params.set('cities', cities.join(','));
    }
    if (courses.length) {
      params.set('courses', courses.join(','));
    }
    const response = await fetch(`/api/archive-leads?${params.toString()}`, {
      cache: 'no-store',
    });
    const data = (await response.json()) as ArchiveResponse;
    if (response.status === 401) {
      setAuthStatus('locked');
      setNotice('Passcode required.');
      return;
    }
    setArchive(data);
    if (!silent) {
      setNotice(
        response.ok
          ? `${data.archiveCount.toLocaleString()} synced leads available in i-wns.`
          : data.message || 'Unable to load i-wns leads.',
      );
    }
  }

  async function syncCrmLeads(): Promise<SyncResult> {
    const response = await fetch('/api/crm-sync', { method: 'POST' });
    const data = (await response.json()) as SyncResult;
    if (!response.ok) {
      throw new Error(data.message || 'CRM sync failed.');
    }
    await loadArchivePage({ page: 1, silent: true });
    return data;
  }

  async function handleLogin(event: { preventDefault: () => void }) {
    event.preventDefault();
    setAuthError('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
    if (!response.ok) {
      setAuthError('Incorrect passcode.');
      return;
    }
    setPasscode('');
    setAuthStatus('authenticated');
    setNotice('Passcode accepted.');
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setArchive({ ...emptyArchive, status: 'idle' });
    setAuthStatus('locked');
    setNotice('Passcode required.');
  }

  if (authStatus !== 'authenticated') {
    return (
      <PasscodeGate
        authStatus={authStatus}
        authError={authError}
        passcode={passcode}
        setPasscode={setPasscode}
        onSubmit={handleLogin}
      />
    );
  }

  const pageTitle =
    navItems.find((item) => item.id === activeView)?.label || 'Dashboard';
  const isReportTab = Boolean(initialReportId);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar px-4 py-5 lg:block">
          <div className="flex flex-col items-center gap-3 px-2 text-center">
            <Image
              src="/dv-logo.png"
              alt="DV"
              width={128}
              height={88}
              className="rounded-md border border-border bg-white object-contain p-2"
            />
            <div>
              <p className="text-lg font-semibold">WhatsApp Reachout</p>
              <p className="text-xs text-muted-foreground">Lead campaign OS</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveView(item.id);
                  setNotice(`Opened ${item.label}.`);
                }}
                className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition ${
                  activeView === item.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-4 backdrop-blur md:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-normal">
                  {pageTitle}
                </h1>
              </div>
              <Button variant="outline" onClick={handleLogout}>
                <Lock className="size-4" />
                Lock
              </Button>
            </div>
          </header>

          <MobileNav activeView={activeView} onChange={setActiveView} />

          {activeView === 'dashboard' && (
            <DashboardView
              archive={archive}
              batches={batches}
              templates={templates}
            />
          )}
          {activeView === 'templates' && (
            <TemplatesView
              templates={templates}
              metaTemplates={metaTemplates}
              setTemplates={setTemplates}
              setMetaTemplates={setMetaTemplates}
              setNotice={setNotice}
            />
          )}
          {activeView === 'reachout' && (
            <ReachOutView
              archive={archive}
              templates={metaTemplates}
              loadArchivePage={loadArchivePage}
              setBatches={setBatches}
              setActiveView={setActiveView}
              setSelectedReportId={setSelectedReportId}
              setNotice={setNotice}
            />
          )}
          {activeView === 'reporting' && (
            <ReportingView
              batches={batches}
              leads={archive.leads}
              templates={[...metaTemplates, ...templates]}
              selectedReportId={selectedReportId}
              showReportDetail={isReportTab}
              setBatches={setBatches}
              setSelectedReportId={setSelectedReportId}
              setNotice={setNotice}
            />
          )}
          {activeView === 'sync' && (
            <SyncView archive={archive} onSyncCrm={syncCrmLeads} />
          )}
          {activeView === 'settings' && <SettingsView setNotice={setNotice} />}
        </section>
      </div>
    </main>
  );
}

function PasscodeGate({
  authStatus,
  passcode,
  authError,
  setPasscode,
  onSubmit,
}: {
  authStatus: 'checking' | 'authenticated' | 'locked';
  passcode: string;
  authError: string;
  setPasscode: (value: string) => void;
  onSubmit: (event: { preventDefault: () => void }) => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Image
            src="/dv-logo.png"
            alt="DV"
            width={46}
            height={46}
            className="rounded-md border border-border bg-white object-contain p-1"
          />
          <div>
            <h1 className="text-lg font-semibold">WhatsApp Reachout</h1>
            <p className="text-sm text-muted-foreground">Protected access</p>
          </div>
        </div>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium" htmlFor="passcode">
            Passcode
          </label>
          <Input
            id="passcode"
            inputMode="numeric"
            type="password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="Enter passcode"
          />
          {authError && (
            <p className="text-sm font-medium text-destructive">{authError}</p>
          )}
          <Button className="w-full" disabled={authStatus === 'checking'}>
            <ShieldCheck className="size-4" />
            {authStatus === 'checking' ? 'Checking access' : 'Unlock'}
          </Button>
        </form>
      </section>
    </main>
  );
}

function MobileNav({
  activeView,
  onChange,
}: {
  activeView: ViewId;
  onChange: (view: ViewId) => void;
}) {
  return (
    <div className="border-b border-border px-4 py-3 lg:hidden">
      <Select
        value={activeView}
        onValueChange={(value) => value && onChange(value as ViewId)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {navItems.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DashboardView({
  archive,
  batches,
  templates,
}: {
  archive: ArchiveResponse;
  batches: BatchRecord[];
  templates: TemplateRecord[];
}) {
  const reachedOut = batches.reduce((sum, batch) => sum + batch.sent, 0);
  const converted = batches.reduce(
    (sum, batch) => sum + (batch.convertedLeadIds || []).length,
    0,
  );
  const [templateFilter, setTemplateFilter] = useState('all');
  const trend = buildTrendData(batches, templateFilter);

  return (
    <div className="space-y-4 px-4 py-5 md:px-6">
      <section className="grid gap-3 md:grid-cols-3">
        <Metric
          icon={Archive}
          label="Archived leads"
          value={archive.archiveCount.toLocaleString()}
        />
        <Metric
          icon={Send}
          label="Reached out"
          value={reachedOut.toLocaleString()}
        />
        <Metric
          icon={Check}
          label="Converted"
          value={converted.toLocaleString()}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Overall performance</h2>
            <p className="text-sm text-muted-foreground">
              Reads, clicks, replies, and conversions by template.
            </p>
          </div>
          <Select
            value={templateFilter}
            onValueChange={(value) => value && setTemplateFilter(value)}
          >
            <SelectTrigger className="w-full md:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All templates</SelectItem>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {trend.length ? (
          <div className="mt-4 h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={260}>
              <AreaChart data={trend} margin={{ left: 0, right: 12 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={38} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="read"
                  stroke="#1fa463"
                  fill="#1fa46333"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="clicks"
                  stroke="#1769aa"
                  fill="#1769aa22"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="replies"
                  stroke="#c06f24"
                  fill="#c06f2422"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="converted"
                  stroke="#6f4bb8"
                  fill="#6f4bb822"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="No performance data yet"
            text="After you send a batch, this trendline will show reads, clicks, replies, and conversions."
          />
        )}
      </section>
    </div>
  );
}

function TemplatesView({
  templates,
  metaTemplates,
  setTemplates,
  setMetaTemplates,
  setNotice,
}: {
  templates: TemplateRecord[];
  metaTemplates: TemplateRecord[];
  setTemplates: (
    updater: (templates: TemplateRecord[]) => TemplateRecord[],
  ) => void;
  setMetaTemplates: (templates: TemplateRecord[]) => void;
  setNotice: (notice: string) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Marketing');
  const [body, setBody] = useState('');
  const [mediaName, setMediaName] = useState('');
  const [syncingTemplates, setSyncingTemplates] = useState(false);

  function addTemplate() {
    if (!name.trim() || !body.trim()) {
      setNotice('Template name and message are required.');
      return;
    }
    const template: TemplateRecord = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category,
      body: body.trim(),
      mediaName,
      status: 'Draft',
      source: 'draft',
    };
    setTemplates((current) => [template, ...current]);
    setName('');
    setBody('');
    setMediaName('');
    setNotice(
      'Draft template added in i-wns. Submit the same template in Meta before sending.',
    );
  }

  async function syncMetaTemplates() {
    setSyncingTemplates(true);
    try {
      const syncResponse = await fetch('/api/meta/templates/sync', {
        method: 'POST',
      });
      const syncData = (await syncResponse.json()) as {
        syncedCount?: number;
        message?: string;
      };
      if (!syncResponse.ok) {
        throw new Error(syncData.message || 'Unable to sync Meta templates.');
      }
      const listResponse = await fetch('/api/meta/templates', {
        cache: 'no-store',
      });
      const listData = (await listResponse.json()) as {
        templates?: TemplateRecord[];
        message?: string;
      };
      if (!listResponse.ok) {
        throw new Error(listData.message || 'Unable to load Meta templates.');
      }
      setMetaTemplates(listData.templates || []);
      setNotice(
        `Synced ${Number(syncData.syncedCount || 0).toLocaleString()} templates from Meta.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Unable to sync templates.',
      );
    } finally {
      setSyncingTemplates(false);
    }
  }

  return (
    <div className="grid gap-4 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1fr)_430px]">
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Meta approved templates</h2>
              <p className="text-sm text-muted-foreground">
                Only Active Meta templates can be selected for WhatsApp sending.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={syncingTemplates}
              onClick={() => void syncMetaTemplates()}
            >
              <RefreshCw className="size-4" />
              {syncingTemplates ? 'Syncing' : 'Sync Meta'}
            </Button>
          </div>
          {metaTemplates.length ? (
            <div className="grid gap-3 p-4">
              {metaTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  sendReady={isApprovedMetaTemplate(template)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="No Meta templates synced"
              text="Click Sync Meta after creating or approving templates in WhatsApp Manager."
            />
          )}
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="text-lg font-semibold">Draft templates</h2>
            <p className="text-sm text-muted-foreground">
              Drafts are for planning copy in i-wns only. Create and approve the
              same template in Meta before it can be sent.
            </p>
          </div>
          {templates.length ? (
          <div className="grid gap-3 p-4">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                sendReady={false}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No draft templates"
            text="Use drafts to prepare copy before submitting it in Meta."
          />
        )}
      </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Add draft template</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This does not submit to Meta. It is for planning and maintaining copy
          in i-wns.
        </p>
        <div className="mt-4 space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Template name"
          />
          <Select
            value={category}
            onValueChange={(value) => value && setCategory(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Marketing">Marketing</SelectItem>
              <SelectItem value="Utility">Utility</SelectItem>
              <SelectItem value="Authentication">Authentication</SelectItem>
            </SelectContent>
          </Select>
          <textarea
            className="min-h-36 w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-3 focus:ring-ring/25"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Message body"
          />
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <span className="truncate">{mediaName || 'Attach media file'}</span>
            <Upload className="size-4 text-muted-foreground" />
            <input
              className="sr-only"
              type="file"
              onChange={(event) =>
                setMediaName(event.target.files?.[0]?.name || '')
              }
            />
          </label>
          <Button className="w-full" onClick={addTemplate}>
            <Plus className="size-4" />
            Add draft
          </Button>
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            For sending, create/approve the template in Meta, then click Sync
            Meta. Reach Out will only show active Meta templates.
          </div>
        </div>
      </section>
    </div>
  );
}

function TemplateCard({
  template,
  sendReady,
}: {
  template: TemplateRecord;
  sendReady: boolean;
}) {
  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{template.name}</h3>
          <p className="text-sm text-muted-foreground">
            {template.category}
            {template.language ? ` - ${template.language}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {template.mediaName && (
            <Badge variant="outline">
              <Paperclip className="size-3" />
              media
            </Badge>
          )}
          <Badge variant={sendReady ? 'default' : 'outline'}>
            {sendReady ? 'Ready to send' : template.status || 'Draft only'}
          </Badge>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {template.body || 'No body text synced.'}
      </p>
      {!sendReady && (
        <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {template.source === 'meta'
            ? 'This Meta template is not active yet, so it cannot be used in Reach Out.'
            : 'Draft only. Create and approve the same template in Meta, then sync it here.'}
        </p>
      )}
    </article>
  );
}

function isApprovedMetaTemplate(template: TemplateRecord) {
  return (
    template.source === 'meta' &&
    ['APPROVED', 'ACTIVE'].includes(String(template.status || '').toUpperCase())
  );
}

function ReachOutView({
  archive,
  templates,
  loadArchivePage,
  setBatches,
  setActiveView,
  setSelectedReportId,
  setNotice,
}: {
  archive: ArchiveResponse;
  templates: TemplateRecord[];
  loadArchivePage: (params: {
    page?: number;
    cities?: string[];
    courses?: string[];
    search?: string;
    silent?: boolean;
  }) => Promise<void>;
  setBatches: (updater: (batches: BatchRecord[]) => BatchRecord[]) => void;
  setActiveView: (view: ViewId) => void;
  setSelectedReportId: (id: string) => void;
  setNotice: (notice: string) => void;
}) {
  const [batchName, setBatchName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectionCount, setSelectionCount] = useState('500');
  const [selecting, setSelecting] = useState(false);

  const currentPage = archive.page || 1;
  const totalPages = archive.totalPages || 1;
  const filteredCount = archive.filteredCount ?? archive.archiveCount;
  const visibleLeads = archive.leads;
  const cities = archive.cities || [];
  const courses = archive.courses || [];
  const sendTemplates = templates.filter(isApprovedMetaTemplate);

  function loadPage(
    nextPage: number,
    nextCities = selectedCities,
    nextCourses = selectedCourses,
  ) {
    return loadArchivePage({
      page: nextPage,
      cities: nextCities,
      courses: nextCourses,
      search,
    });
  }

  async function selectFilteredLimit() {
    const requested = Math.max(Number(selectionCount || '0'), 1);
    setSelecting(true);
    try {
      const params = new URLSearchParams({
        limit: String(requested),
        search,
      });
      if (selectedCities.length) {
        params.set('cities', selectedCities.join(','));
      }
      if (selectedCourses.length) {
        params.set('courses', selectedCourses.join(','));
      }
      const response = await fetch(
        `/api/archive-leads/selection?${params.toString()}`,
        { cache: 'no-store' },
      );
      const data = (await response.json()) as {
        leadIds?: string[];
        selectedCount?: number;
        message?: string;
      };
      if (!response.ok) {
        setNotice(data.message || 'Unable to select filtered leads.');
        return;
      }
      setSelectedLeadIds(data.leadIds || []);
      setNotice(
        `Selected ${Number(data.selectedCount || 0).toLocaleString()} leads from current filters.`,
      );
    } finally {
      setSelecting(false);
    }
  }

  function toggleLead(id: string) {
    setSelectedLeadIds((current) =>
      current.includes(id)
        ? current.filter((leadId) => leadId !== id)
        : [...current, id],
    );
  }

  async function sendBatch() {
    if (!batchName.trim() || !templateId || !selectedLeadIds.length) {
      setNotice('Batch name, template, and at least one lead are required.');
      return;
    }
    const template = sendTemplates.find((item) => item.id === templateId);
    if (!template) {
      setNotice('Choose an active Meta template before sending.');
      return;
    }
    setNotice('Sending WhatsApp batch through Meta API.');
    const response = await fetch('/api/batches/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: batchName.trim(),
        templateId,
        templateName: template?.name || templateId,
        languageCode: template.language || 'en_US',
        leadIds: selectedLeadIds,
      }),
    });
    const data = (await response.json()) as SendBatchResponse;
    if (!response.ok || !data.batch) {
      setNotice(data.message || 'Unable to send WhatsApp batch.');
      return;
    }
    setBatches((current) => [data.batch as BatchRecord, ...current]);
    setBatchName('');
    setSelectedLeadIds([]);
    setActiveView('reporting');
    setNotice(
      `Sent ${Number(data.sentCount || 0).toLocaleString()} messages. ${Number(data.failedCount || 0).toLocaleString()} failed.`,
    );
  }

  return (
    <div className="grid gap-4 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-lg font-semibold">Select leads</h2>
          <p className="text-sm text-muted-foreground">
            Filter Main Admission archive leads, choose a template, name the
            batch, then send.
          </p>
        </div>
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-2">
          <MultiSelectFilter
            label="Location"
            options={cities}
            selected={selectedCities}
            onChange={(values) => {
              setSelectedCities(values);
              void loadPage(1, values, selectedCourses);
            }}
          />
          <MultiSelectFilter
            label="Course"
            options={courses}
            selected={selectedCourses}
            onChange={(values) => {
              setSelectedCourses(values);
              void loadPage(1, selectedCities, values);
            }}
          />
        </div>
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, location, course"
            />
          </div>
          <Button
            variant="outline"
            onClick={() =>
              void loadArchivePage({
                cities: selectedCities,
                courses: selectedCourses,
                page: 1,
                search,
              })
            }
          >
            Search
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setSelectedLeadIds((current) =>
                Array.from(
                  new Set([...current, ...visibleLeads.map((lead) => lead.id)]),
                ),
              )
            }
          >
            <Users className="size-4" />
            Select page
          </Button>
        </div>
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span>
            Showing page {currentPage.toLocaleString()} of{' '}
            {totalPages.toLocaleString()} - {visibleLeads.length} leads on this
            page, {filteredCount.toLocaleString()} matching leads total.
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => void loadPage(currentPage - 1)}
            >
              <ChevronLeft className="size-4" />
              Page {Math.max(currentPage - 1, 1)}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => void loadPage(currentPage + 1)}
            >
              Page {Math.min(currentPage + 1, totalPages)}
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        {visibleLeads.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <input
                      aria-label={`Select ${lead.name}`}
                      checked={selectedLeadIds.includes(lead.id)}
                      onChange={() => toggleLead(lead.id)}
                      type="checkbox"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{lead.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {lead.phone}
                    </div>
                  </TableCell>
                  <TableCell>{lead.city}</TableCell>
                  <TableCell>{lead.company}</TableCell>
                  <TableCell>{lead.score}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={Archive}
            title="No leads found"
            text="Change filters or check CRM sync."
          />
        )}
      </section>

      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">Selection panel</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a larger set from the current filters, independent of the
            100-row page.
          </p>
          <div className="mt-4 space-y-3">
            <Input
              min={1}
              max={5000}
              type="number"
              value={selectionCount}
              onChange={(event) => setSelectionCount(event.target.value)}
              placeholder="500, 1000, or any number"
            />
            <Button
              className="w-full"
              variant="outline"
              disabled={selecting}
              onClick={() => void selectFilteredLimit()}
            >
              <Users className="size-4" />
              {selecting ? 'Selecting leads' : 'Select from filters'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => setSelectedLeadIds([])}
            >
              Clear selection
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">Send batch</h2>
          <div className="mt-4 space-y-3">
            <Input
              value={batchName}
              onChange={(event) => setBatchName(event.target.value)}
              placeholder="Batch name"
            />
            <Select
              value={templateId}
              onValueChange={(value) => value && setTemplateId(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose template" />
              </SelectTrigger>
              <SelectContent>
                {sendTemplates.length ? (
                  sendTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.language || 'en_US'})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none">
                    No active Meta templates synced
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm font-medium">Selected leads</p>
              <p className="text-3xl font-semibold">
                {selectedLeadIds.length.toLocaleString()}
              </p>
            </div>
            <Button
              className="w-full"
              onClick={sendBatch}
              disabled={!sendTemplates.length}
            >
              <Send className="size-4" />
              Send message
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function ReportingView({
  batches,
  leads,
  templates,
  selectedReportId,
  showReportDetail,
  setBatches,
  setSelectedReportId,
  setNotice,
}: {
  batches: BatchRecord[];
  leads: ArchiveLead[];
  templates: TemplateRecord[];
  selectedReportId: string;
  showReportDetail: boolean;
  setBatches: (updater: (batches: BatchRecord[]) => BatchRecord[]) => void;
  setSelectedReportId: (id: string) => void;
  setNotice: (notice: string) => void;
}) {
  const selectedBatch = batches.find((batch) => batch.id === selectedReportId);
  const [reportSearch, setReportSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<ReportActionFilter>('all');
  const [reportPage, setReportPage] = useState(1);
  const [reportData, setReportData] = useState<BatchReportResponse | null>(
    null,
  );
  const [loadingReport, setLoadingReport] = useState(false);
  const reportBatch = reportData?.batch || selectedBatch;
  const reportRows = reportData?.rows || [];
  const convertedLeadIds = reportBatch?.convertedLeadIds || [];

  useEffect(() => {
    let cancelled = false;
    async function loadReport() {
      if (!showReportDetail || !selectedReportId) {
        setReportData(null);
        return;
      }
      setLoadingReport(true);
      try {
        const params = new URLSearchParams({
          page: String(reportPage),
          action: actionFilter,
          search: reportSearch,
        });
        const response = await fetch(
          `/api/batches/${selectedReportId}/report?${params.toString()}`,
          { cache: 'no-store' },
        );
        const data = (await response.json()) as BatchReportResponse;
        if (!response.ok) {
          throw new Error(data.message || 'Unable to load report.');
        }
        if (!cancelled) {
          setReportData(data);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice(
            error instanceof Error ? error.message : 'Unable to load report.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingReport(false);
        }
      }
    }
    void loadReport();
    return () => {
      cancelled = true;
    };
  }, [
    actionFilter,
    reportPage,
    reportSearch,
    selectedReportId,
    setNotice,
    showReportDetail,
  ]);

  async function toggleConverted(leadId: string) {
    if (!reportBatch) return;
    const shouldConvert = !convertedLeadIds.includes(leadId);
    setBatches((current) =>
      current.map((batch) => {
        if (batch.id !== reportBatch.id) return batch;
        const existing = batch.convertedLeadIds || [];
        const nextConvertedLeadIds = shouldConvert
          ? [...existing, leadId]
          : existing.filter((id) => id !== leadId);
        return {
          ...batch,
          convertedLeadIds: nextConvertedLeadIds,
          converted: nextConvertedLeadIds.length,
        };
      }),
    );
    try {
      const response = await fetch(`/api/batches/${reportBatch.id}/converted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, converted: shouldConvert }),
      });
      const data = (await response.json()) as {
        batch?: BatchRecord;
        message?: string;
      };
      if (!response.ok || !data.batch) {
        throw new Error(data.message || 'Unable to update conversion.');
      }
      setBatches((current) =>
        current.map((batch) =>
          batch.id === data.batch?.id ? (data.batch as BatchRecord) : batch,
        ),
      );
      setReportData((current) =>
        current
          ? {
              ...current,
              batch: data.batch,
              rows: current.rows?.map((row) =>
                row.lead.id === leadId
                  ? { ...row, converted: shouldConvert }
                  : row,
              ),
            }
          : current,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Unable to update conversion.',
      );
    }
  }

  async function deleteReport(batch: BatchRecord) {
    const confirmed = window.confirm(
      `Delete the "${batch.name}" report? Its leads will become selectable again and it will stop counting as reached.`,
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/batches/${batch.id}`, {
        method: 'DELETE',
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message || 'Unable to delete report.');
      }
      setBatches((current) =>
        current.filter((currentBatch) => currentBatch.id !== batch.id),
      );
      if (selectedReportId === batch.id) {
        setSelectedReportId('');
        setReportData(null);
      }
      setNotice(
        `Deleted ${batch.name}. Those leads are now available for future batches.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Unable to delete report.',
      );
    }
  }

  function exportFilteredLeads() {
    if (!reportBatch) return;
    const rows = reportRows.map((row) => ({
      name: row.lead.name,
      phone: row.lead.phone,
      location: row.lead.city,
      course: row.lead.company,
      status: reportStatusLabel(row),
      read: row.read ? 'Yes' : 'No',
      clicked: row.clicked ? 'Yes' : 'No',
      replied: row.replied ? 'Yes' : 'No',
      reply: row.replies.map((reply) => reply.text).join(' | '),
      error: row.error,
      converted: row.converted ? 'Yes' : 'No',
    }));
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${reportBatch.name}-${actionFilter}-leads.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(
      `Exported ${rows.length.toLocaleString()} ${actionFilter} leads from ${reportBatch.name}.`,
    );
  }

  return (
    <div className="space-y-4 px-4 py-5 md:px-6">
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-lg font-semibold">Batch reports</h2>
          <p className="text-sm text-muted-foreground">
            Open a batch report to review performance and export good leads.
          </p>
        </div>
        {batches.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Read</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead>Replies</TableHead>
                <TableHead>Converted</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell>
                    <div className="font-medium">{batch.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {batch.createdAt}
                    </div>
                  </TableCell>
                  <TableCell>
                    {templateName(templates, batch.templateId)}
                  </TableCell>
                  <TableCell>{batch.sent}</TableCell>
                  <TableCell>{batch.failed}</TableCell>
                  <TableCell>{batch.read}</TableCell>
                  <TableCell>{batch.clicks}</TableCell>
                  <TableCell>{batch.replies}</TableCell>
                  <TableCell>{(batch.convertedLeadIds || []).length}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          window.open(
                            `/?report=${batch.id}`,
                            '_blank',
                            'noopener,noreferrer',
                          );
                        }}
                      >
                        <Eye className="size-4" />
                        View report
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void deleteReport(batch)}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="No reports yet"
            text="Reports will appear after you send the first batch."
          />
        )}
      </section>

      {showReportDetail && selectedReportId && reportBatch && (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{reportBatch.name}</h2>
              <p className="text-sm text-muted-foreground">
                In-depth report tab - 100 leads per page
              </p>
            </div>
            <Button
              variant="outline"
              onClick={exportFilteredLeads}
              disabled={!reportRows.length}
            >
              <FileSpreadsheet className="size-4" />
              Export leads
            </Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-6">
            <MiniMetric label="Sent" value={reportData?.totals?.sent || 0} />
            <MiniMetric label="Failed" value={reportData?.totals?.failed || 0} />
            <MiniMetric label="Read" value={reportData?.totals?.read || 0} />
            <MiniMetric label="Clicks" value={reportData?.totals?.clicked || 0} />
            <MiniMetric label="Replies" value={reportData?.totals?.replied || 0} />
            <MiniMetric label="Converted" value={convertedLeadIds.length} />
          </div>
          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h3 className="font-semibold">Sent leads</h3>
            <div className="grid gap-2 md:grid-cols-[180px_320px]">
              <Select
                value={actionFilter}
                onValueChange={(value) => {
                  if (!value) return;
                  setReportPage(1);
                  setActionFilter(value as ReportActionFilter);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="clicked">Clicked</SelectItem>
                  <SelectItem value="replied">Replied</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="not-opened">Not opened</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={reportSearch}
                  onChange={(event) => {
                    setReportPage(1);
                    setReportSearch(event.target.value);
                  }}
                  placeholder="Search leads, replies, errors"
                />
              </div>
            </div>
          </div>
          {loadingReport ? (
            <div className="mt-3 rounded-lg bg-muted p-5 text-sm">
              Loading report.
            </div>
          ) : reportRows.length ? (
            <>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Read</TableHead>
                      <TableHead>Clicked</TableHead>
                      <TableHead>Reply</TableHead>
                      <TableHead>Meta error</TableHead>
                      <TableHead>Converted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportRows.map((row) => (
                      <TableRow key={row.lead.id}>
                        <TableCell>
                          <div className="font-medium">{row.lead.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {row.lead.phone}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.lead.city} - {row.lead.company}
                          </div>
                        </TableCell>
                        <TableCell>{reportStatusLabel(row)}</TableCell>
                        <TableCell>{row.read ? 'Yes' : 'No'}</TableCell>
                        <TableCell>{row.clicked ? 'Yes' : 'No'}</TableCell>
                        <TableCell className="max-w-sm">
                          {row.replies.length ? (
                            <div className="space-y-1">
                              {row.replies.map((reply, index) => (
                                <p key={`${row.lead.id}-${index}`} className="text-sm">
                                  {reply.text || reply.type}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No reply</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-sm text-sm text-muted-foreground">
                          {row.error || '-'}
                        </TableCell>
                        <TableCell>
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              checked={row.converted}
                              onChange={() => void toggleConverted(row.lead.id)}
                              type="checkbox"
                            />
                            <span className="text-sm">Mark converted</span>
                          </label>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                <span>
                  Page {Number(reportData?.page || 1).toLocaleString()} of{' '}
                  {Number(reportData?.totalPages || 1).toLocaleString()} -{' '}
                  {Number(reportData?.totalRows || 0).toLocaleString()} rows
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reportPage <= 1}
                    onClick={() => setReportPage((page) => Math.max(page - 1, 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Page {Math.max(reportPage - 1, 1)}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reportPage >= Number(reportData?.totalPages || 1)}
                    onClick={() =>
                      setReportPage((page) =>
                        Math.min(page + 1, Number(reportData?.totalPages || 1)),
                      )
                    }
                  >
                    Page {Math.min(reportPage + 1, Number(reportData?.totalPages || 1))}
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-border bg-background p-5 text-sm text-muted-foreground">
              No leads found for this action filter and search.
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const visibleOptions = options
    .filter((option) => option.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 80);
  const summary = selected.length
    ? `${selected.length} selected`
    : `All ${label.toLowerCase()}s`;

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  return (
    <details className="rounded-lg border border-input bg-background">
      <summary className="flex h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="truncate font-medium">{summary}</span>
      </summary>
      <div className="border-t border-border p-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${label.toLowerCase()}`}
        />
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <button
            className="font-medium text-primary"
            onClick={() => onChange([])}
          >
            Clear
          </button>
          <span>{options.length.toLocaleString()} options</span>
        </div>
        <div className="mt-3 max-h-56 space-y-1 overflow-auto">
          {visibleOptions.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <input
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
                type="checkbox"
              />
              <span className="truncate">{option}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function SyncView({
  archive,
  onSyncCrm,
}: {
  archive: ArchiveResponse;
  onSyncCrm: () => Promise<SyncResult>;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  async function handleSync() {
    setSyncing(true);
    setSyncResult('Starting sync from i-crm read-only source.');
    try {
      const result = await onSyncCrm();
      setSyncResult(
        `Done: ${Number(result.syncedCount || 0).toLocaleString()} leads checked, ${Number(result.removedStaleCount || 0).toLocaleString()} stale leads removed, and ${Number(result.storedCount || 0).toLocaleString()} leads stored in i-wns.`,
      );
    } catch (error) {
      setSyncResult(
        error instanceof Error ? error.message : 'CRM sync failed.',
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="grid gap-4 px-4 py-5 md:px-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">CRM connection</h2>
        <div className="mt-4">
          <Metric
            icon={Users}
            label="Archive leads"
            value={archive.archiveCount.toLocaleString()}
            detail="stored in i-wns"
          />
        </div>
        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="font-semibold">Read rule</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {archive.archiveRule ||
              'Archive rule will appear after the API connects.'}
          </p>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Sync now</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Copies Main Admission archived leads from i-crm into the i-wns
          database for outreach filtering and paging.
        </p>
        <Button className="mt-4" disabled={syncing} onClick={handleSync}>
          <RefreshCw className="size-4" />
          {syncing ? 'Syncing leads' : 'Sync now'}
        </Button>
        {syncResult && (
          <div className="mt-4 rounded-lg bg-muted p-4 text-sm">
            {syncResult}
          </div>
        )}
      </section>
    </div>
  );
}

function SettingsView({ setNotice }: { setNotice: (notice: string) => void }) {
  const [metaStatus, setMetaStatus] = useState<MetaStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMetaStatus() {
      try {
        const response = await fetch('/api/meta/status', { cache: 'no-store' });
        const data = (await response.json()) as MetaStatus;
        if (!cancelled && response.ok) {
          setMetaStatus(data);
        }
      } catch {
        if (!cancelled) {
          setNotice('Unable to load Meta API status.');
        }
      }
    }
    void loadMetaStatus();
    return () => {
      cancelled = true;
    };
  }, [setNotice]);

  return (
    <div className="grid gap-4 px-4 py-5 md:px-6 xl:grid-cols-2">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Meta WhatsApp API</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <MetaFlag label="Send API" ready={Boolean(metaStatus?.configured)} />
          <MetaFlag label="Webhook" ready={Boolean(metaStatus?.webhookReady)} />
          <MetaFlag
            label="Signature check"
            ready={Boolean(metaStatus?.signatureCheckReady)}
          />
        </div>
        <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium">Webhook URL</p>
          <p className="mt-1 break-all text-muted-foreground">
            {metaStatus?.webhookUrl || 'Loading'}
          </p>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <p>
            Graph version:{' '}
            <span className="font-medium">
              {metaStatus?.graphVersion || '-'}
            </span>
          </p>
          <p>
            Phone number ID:{' '}
            <span className="font-medium">
              {metaStatus?.phoneNumberId || 'not set'}
            </span>
          </p>
          <p>
            WABA ID:{' '}
            <span className="font-medium">
              {metaStatus?.wabaId || 'not set'}
            </span>
          </p>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">WhatsApp sending rules</h2>
        <div className="mt-4 space-y-3">
          <ControlRow
            label="Require opt-in before marketing templates"
            description="Marketing messages should only go to leads who have consented to receive promotional WhatsApp outreach."
            checked
          />
          <ControlRow
            label="Stop sending when lead replies STOP"
            description="When a lead opts out, future campaign batches should skip that phone number."
            checked
          />
          <ControlRow
            label="Limit marketing retries to two per month"
            description="Prevents repeated messaging to the same lead too often, reducing spam complaints and quality risk."
            checked
          />
          <ControlRow
            label="Pause batch on high failure rate"
            description="If too many sends fail, the system should stop the batch so phone/template issues can be checked."
            checked
          />
        </div>
      </section>
      <Button
        className="xl:col-span-2"
        onClick={() => setNotice('Settings storage is pending backend setup.')}
      >
        <Check className="size-4" />
        Save settings
      </Button>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-normal">{value}</p>
      {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
    </div>
  );
}

function MetaFlag({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{ready ? 'Ready' : 'Needs setup'}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function ControlRow({
  label,
  description,
  checked = false,
}: {
  label: string;
  description?: string;
  checked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-muted p-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && (
          <span className="mt-1 block text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <Switch defaultChecked={checked} />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
      <Icon className="size-10 text-primary" />
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function buildTrendData(batches: BatchRecord[], templateFilter: string) {
  return batches
    .filter(
      (batch) =>
        templateFilter === 'all' || batch.templateId === templateFilter,
    )
    .slice()
    .reverse()
    .map((batch, index) => ({
      label: `Batch ${index + 1}`,
      read: batch.read,
      clicks: batch.clicks,
      replies: batch.replies,
      converted: (batch.convertedLeadIds || []).length,
    }));
}

function templateName(templates: TemplateRecord[], id: string) {
  return templates.find((template) => template.id === id)?.name || '-';
}

function filterLeadsByAction(
  leads: ArchiveLead[],
  batch: BatchRecord | undefined,
  action: ReportActionFilter,
) {
  if (!batch) return [];
  const readIds = batch.readLeadIds || [];
  const clickedIds = batch.clickedLeadIds || [];
  const repliedIds = batch.repliedLeadIds || [];
  const convertedIds = batch.convertedLeadIds || [];
  const actionSets: Record<ReportActionFilter, Set<string>> = {
    all: new Set(batch.leadIds),
    sent: new Set(batch.leadIds),
    failed: new Set(batch.failedLeadIds || []),
    read: new Set(readIds),
    clicked: new Set(clickedIds),
    replied: new Set(repliedIds),
    converted: new Set(convertedIds),
    'not-opened': new Set(
      batch.leadIds.filter((leadId) => !readIds.includes(leadId)),
    ),
  };
  const allowed = actionSets[action];
  return leads.filter((lead) => allowed.has(lead.id));
}

function actionLabel(action: ReportActionFilter) {
  const labels: Record<ReportActionFilter, string> = {
    all: 'All',
    sent: 'Message sent',
    failed: 'Failed',
    read: 'Read',
    clicked: 'Clicked',
    replied: 'Replied',
    converted: 'Converted',
    'not-opened': 'Not opened',
  };
  return labels[action];
}

function reportStatusLabel(row: ReportLeadRow) {
  if (row.error || row.messageStatus === 'failed') return 'Failed';
  if (row.converted) return 'Converted';
  if (row.replied) return 'Replied';
  if (row.clicked) return 'Clicked';
  if (row.read) return 'Read';
  if (row.messageStatus === 'sent') return 'Message sent';
  return row.messageStatus.replace(/_/g, ' ');
}

function toCsv(rows: Record<string, string>[]) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header] || '')).join(','),
    ),
  ];
  return lines.join('\n');
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
