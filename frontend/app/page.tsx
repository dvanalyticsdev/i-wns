'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Bell,
  Check,
  ChevronRight,
  ClipboardList,
  Database,
  Download,
  Filter,
  LayoutDashboard,
  MessageCircle,
  PhoneCall,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Wand2,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ViewId =
  | 'dashboard'
  | 'batches'
  | 'archive'
  | 'templates'
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
  leads: ArchiveLead[];
  collection?: string;
  archiveRule?: string;
};

type SubmitEventLike = {
  preventDefault: () => void;
};

const emptyArchive: ArchiveResponse = {
  status: 'idle',
  archiveCount: 0,
  leads: [],
};

const navItems: Array<{
  id: ViewId;
  label: string;
  icon: LucideIcon;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'batches', label: 'Campaign Batches', icon: Send },
  { id: 'archive', label: 'Archived Leads', icon: Archive },
  { id: 'templates', label: 'Templates', icon: ClipboardList },
  { id: 'sync', label: 'CRM Sync', icon: RefreshCw },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Home() {
  const [authStatus, setAuthStatus] = useState<
    'checking' | 'authenticated' | 'locked'
  >('checking');
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState('');
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [leadFilter, setLeadFilter] = useState('all');
  const [archive, setArchive] = useState<ArchiveResponse>({
    ...emptyArchive,
    status: 'loading',
  });
  const [notice, setNotice] = useState(
    'Loading Main Admission Calling archived leads from i-crm.',
  );

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
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
    if (authStatus !== 'authenticated') {
      return;
    }
    let cancelled = false;
    async function loadArchive() {
      setArchive((current) => ({ ...current, status: 'loading' }));
      try {
        const response = await fetch('/api/archive-leads', {
          cache: 'no-store',
        });
        const data = (await response.json()) as ArchiveResponse;
        if (cancelled) {
          return;
        }
        if (response.status === 401) {
          setAuthStatus('locked');
          setNotice('Passcode required.');
          return;
        }
        setArchive(data);
        setNotice(
          response.ok
            ? `Connected to i-crm. ${data.archiveCount.toLocaleString()} Main Admission Calling archived leads found.`
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

  async function handleLogin(event: SubmitEventLike) {
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
    setNotice('Passcode accepted. Loading i-crm archive.');
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setArchive({ ...emptyArchive, status: 'idle' });
    setAuthStatus('locked');
    setNotice('Passcode required.');
  }

  const visibleLeads = useMemo(() => {
    if (leadFilter === 'high-score') {
      return archive.leads.filter((lead) => lead.score >= 70);
    }
    if (leadFilter === 'needs-phone') {
      return archive.leads.filter((lead) => lead.phone === '-');
    }
    return archive.leads;
  }, [archive.leads, leadFilter]);

  const pageTitle = {
    dashboard: 'WhatsApp outreach system',
    batches: 'Campaign batches',
    archive: 'Main Admission archive',
    templates: 'WhatsApp templates',
    sync: 'CRM sync',
    settings: 'Settings',
  }[activeView];

  if (authStatus !== 'authenticated') {
    return (
      <PasscodeGate
        authStatus={authStatus}
        passcode={passcode}
        authError={authError}
        setPasscode={setPasscode}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar px-4 py-5 lg:block">
          <div className="flex items-center gap-3 px-2">
            <Image
              src="/dv-logo.png"
              alt="DV"
              width={42}
              height={42}
              className="rounded-md border border-border bg-white object-contain p-1"
            />
            <div>
              <p className="text-sm font-semibold">WhatsApp Reachout</p>
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

          <div className="mt-8 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-accent-foreground" />
              Next best action
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Start by creating campaign storage, then connect Meta templates
              and WhatsApp webhook events.
            </p>
            <Button
              className="mt-4 w-full"
              size="sm"
              onClick={() => {
                setActiveView('batches');
                setNotice('Campaign setup opened.');
              }}
            >
              <PhoneCall className="size-4" />
              Open setup
            </Button>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-border bg-background/92 px-4 py-4 backdrop-blur md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageCircle className="size-4 text-[#1fa463]" />
                  {notice}
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-normal md:text-3xl">
                  {pageTitle}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setActiveView('sync');
                    setNotice('CRM import panel opened.');
                  }}
                >
                  <Upload className="size-4" />
                  Import CRM leads
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setActiveView('templates');
                    setNotice('Template editor opened.');
                  }}
                >
                  <Wand2 className="size-4" />
                  Draft template
                </Button>
                <Button
                  onClick={() => {
                    setActiveView('batches');
                    setNotice('Create the first real campaign batch.');
                  }}
                >
                  <Plus className="size-4" />
                  New batch
                </Button>
                <Button variant="outline" onClick={handleLogout}>
                  <ShieldCheck className="size-4" />
                  Lock
                </Button>
              </div>
            </div>
          </header>

          <MobileNav activeView={activeView} onChange={setActiveView} />

          {activeView === 'dashboard' && (
            <DashboardView
              archive={archive}
              visibleLeads={visibleLeads}
              leadFilter={leadFilter}
              setLeadFilter={setLeadFilter}
              setActiveView={setActiveView}
              setNotice={setNotice}
            />
          )}
          {activeView === 'batches' && <BatchesView setNotice={setNotice} />}
          {activeView === 'archive' && (
            <ArchiveView
              archive={archive}
              visibleLeads={visibleLeads}
              leadFilter={leadFilter}
              setLeadFilter={setLeadFilter}
              setNotice={setNotice}
            />
          )}
          {activeView === 'templates' && (
            <TemplatesView setNotice={setNotice} />
          )}
          {activeView === 'sync' && (
            <SyncView archive={archive} setNotice={setNotice} />
          )}
          {activeView === 'settings' && <SettingsView setNotice={setNotice} />}
        </section>
      </div>
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
  onSubmit: (event: SubmitEventLike) => void;
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
          <div>
            <label className="text-sm font-medium" htmlFor="passcode">
              Passcode
            </label>
            <Input
              id="passcode"
              inputMode="numeric"
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="Enter passcode"
              className="mt-2"
            />
          </div>
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

function DashboardView({
  archive,
  visibleLeads,
  leadFilter,
  setLeadFilter,
  setActiveView,
  setNotice,
}: {
  archive: ArchiveResponse;
  visibleLeads: ArchiveLead[];
  leadFilter: string;
  setLeadFilter: (filter: string) => void;
  setActiveView: (view: ViewId) => void;
  setNotice: (notice: string) => void;
}) {
  return (
    <div className="grid gap-4 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-4">
        <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          <Metric
            icon={Archive}
            label="Main Admission archive"
            value={archive.archiveCount.toLocaleString()}
            detail={connectionText(archive)}
          />
          <Metric
            icon={Users}
            label="Loaded in table"
            value={archive.leads.length.toLocaleString()}
            detail="latest archived records"
          />
          <Metric
            icon={Send}
            label="Campaign batches"
            value="0"
            detail="backend table not created yet"
          />
          <Metric
            icon={Reply}
            label="Tracked replies"
            value="0"
            detail="WhatsApp webhook not connected yet"
          />
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Current data source
              </p>
              <h2 className="text-xl font-semibold tracking-normal">
                i-crm Main Admission Calling archive
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-[#e8f7ef] text-[#147f4d] hover:bg-[#e8f7ef]">
                {archive.status}
              </Badge>
              {archive.collection && (
                <Badge variant="outline">{archive.collection}</Badge>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-5 2xl:grid-cols-[1fr_320px]">
            <div className="rounded-lg border border-dashed border-border bg-background p-6">
              <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <Database className="size-10 text-primary" />
                <h3 className="mt-3 text-lg font-semibold">
                  No outreach batch data yet
                </h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Leads are coming from i-crm. Sending, read receipts, clicks,
                  replies, and webinar conversions will appear after the i-wns
                  campaign tables and WhatsApp webhooks are added.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setActiveView('batches')}
                >
                  <Plus className="size-4" />
                  Set up campaign batches
                </Button>
              </div>
            </div>
            <div className="space-y-4">
              <FunnelRow
                label="Main Admission archived leads"
                value={archive.archiveCount}
                max={Math.max(archive.archiveCount, 1)}
              />
              <FunnelRow
                label="Loaded preview rows"
                value={archive.leads.length}
                max={Math.max(archive.archiveCount, 1)}
              />
              <FunnelRow label="Messages sent" value={0} max={1} />
              <FunnelRow label="Replies tracked" value={0} max={1} />
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium">Conversion rate</p>
                <p className="text-2xl font-semibold">0%</p>
                <p className="text-sm text-muted-foreground">
                  waiting for WhatsApp and webinar tracking
                </p>
              </div>
            </div>
          </div>
        </section>

        <LeadsPanel
          visibleLeads={visibleLeads}
          leadFilter={leadFilter}
          setLeadFilter={setLeadFilter}
          setNotice={setNotice}
        />
      </div>

      <aside className="space-y-4">
        <TemplateComposer setActiveView={setActiveView} setNotice={setNotice} />
        <CrmQueue archive={archive} />
        <StageBreakdown />
        <ActionAlerts />
      </aside>
    </div>
  );
}

function BatchesView({ setNotice }: { setNotice: (notice: string) => void }) {
  return (
    <div className="px-4 py-5 md:px-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">All message batches</h2>
              <p className="text-sm text-muted-foreground">
                Batch records will be created here after the backend campaign
                storage is added.
              </p>
            </div>
            <Button
              onClick={() =>
                setNotice('Campaign batch backend is not connected yet.')
              }
            >
              <Plus className="size-4" />
              Create batch
            </Button>
          </div>
          <EmptyState
            icon={Send}
            title="No campaign batches yet"
            text="The frontend is ready for this workflow. Next we need database tables for batches, recipients, events, and conversions."
          />
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">Batch controls</h2>
          <div className="mt-4 space-y-3">
            <ControlRow label="Auto-skip leads already messaged" checked />
            <ControlRow label="Pause if quality rating drops" checked />
            <ControlRow label="Send reminder to clickers only" />
            <Button
              className="w-full"
              onClick={() =>
                setNotice(
                  'Reminder creation needs campaign event storage first.',
                )
              }
            >
              <Send className="size-4" />
              Create reminder batch
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function ArchiveView({
  archive,
  visibleLeads,
  leadFilter,
  setLeadFilter,
  setNotice,
}: {
  archive: ArchiveResponse;
  visibleLeads: ArchiveLead[];
  leadFilter: string;
  setLeadFilter: (filter: string) => void;
  setNotice: (notice: string) => void;
}) {
  return (
    <div className="grid gap-4 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Main Admission Calling archived leads
            </h2>
            <p className="text-sm text-muted-foreground">
              Read-only data from i-crm using the archived lead rule.
            </p>
          </div>
          <div className="flex gap-2">
            <Input className="w-56" placeholder="Search archive" />
            <Button variant="outline">
              <Filter className="size-4" />
              Filter
            </Button>
          </div>
        </div>
        {archive.status === 'loading' ? (
          <EmptyState
            icon={RefreshCw}
            title="Loading leads"
            text="Reading Main Admission Calling archived leads from i-crm."
          />
        ) : visibleLeads.length ? (
          <LeadTable leadsToShow={visibleLeads} />
        ) : (
          <EmptyState
            icon={Archive}
            title="No archived leads found"
            text={archive.message || 'The archive query returned no rows.'}
          />
        )}
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Archive actions</h2>
        <div className="mt-4 grid gap-3">
          <SegmentButton
            title="Main Admission archived leads"
            count={archive.archiveCount.toLocaleString()}
            onClick={() => {
              setLeadFilter('all');
              setNotice('Selected Main Admission Calling archived leads.');
            }}
          />
          <SegmentButton
            title="High score preview"
            count={archive.leads
              .filter((lead) => lead.score >= 70)
              .length.toLocaleString()}
            onClick={() => {
              setLeadFilter('high-score');
              setNotice('Selected higher-scoring archived leads.');
            }}
          />
          <SegmentButton
            title="Needs phone cleanup"
            count={archive.leads
              .filter((lead) => lead.phone === '-')
              .length.toLocaleString()}
            onClick={() => {
              setLeadFilter('needs-phone');
              setNotice('Selected archived leads missing phone numbers.');
            }}
          />
          <Select
            value={leadFilter}
            onValueChange={(value) => value && setLeadFilter(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Main Admission archived leads</SelectItem>
              <SelectItem value="high-score">High score preview</SelectItem>
              <SelectItem value="needs-phone">Needs phone cleanup</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>
    </div>
  );
}

function TemplatesView({ setNotice }: { setNotice: (notice: string) => void }) {
  return (
    <div className="grid gap-4 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1fr)_430px]">
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold">Template library</h2>
          <Button
            onClick={() =>
              setNotice(
                'Template storage and Meta approval sync are not connected yet.',
              )
            }
          >
            <Plus className="size-4" />
            New template
          </Button>
        </div>
        <EmptyState
          icon={ClipboardList}
          title="No templates connected"
          text="This page is ready for approved Meta template records. Next backend step: store template names, language, category, body, buttons, and approval status."
        />
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Editor preview</h2>
        <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
          Select or create a real WhatsApp template after Meta Cloud API
          credentials are added.
        </div>
        <Button
          className="mt-4 w-full"
          onClick={() => setNotice('Meta template approval sync pending.')}
        >
          <ShieldCheck className="size-4" />
          Send for approval
        </Button>
      </section>
    </div>
  );
}

function SyncView({
  archive,
  setNotice,
}: {
  archive: ArchiveResponse;
  setNotice: (notice: string) => void;
}) {
  return (
    <div className="grid gap-4 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">CRM connection</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Metric
            icon={Users}
            label="Main Admission archive"
            value={archive.archiveCount.toLocaleString()}
            detail={connectionText(archive)}
          />
          <Metric
            icon={Database}
            label="Collection"
            value={archive.collection || '-'}
            detail="read-only access"
          />
          <Metric
            icon={RefreshCw}
            label="Sync mode"
            value="Live"
            detail="loads through API"
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
        <h2 className="text-lg font-semibold">Sync controls</h2>
        <div className="mt-4 space-y-3">
          <ControlRow
            label="Pull Main Admission Calling archive from i-crm"
            checked
          />
          <ControlRow label="Keep i-crm read-only from i-wns" checked />
          <ControlRow label="Store WhatsApp batch tags in i-wns only" checked />
          <Button
            className="w-full"
            onClick={() =>
              setNotice(
                'Refreshed Main Admission Calling archived leads from i-crm.',
              )
            }
          >
            <RefreshCw className="size-4" />
            Refresh view
          </Button>
        </div>
      </section>
    </div>
  );
}

function SettingsView({ setNotice }: { setNotice: (notice: string) => void }) {
  return (
    <div className="grid gap-4 px-4 py-5 md:px-6 xl:grid-cols-2">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">WhatsApp sending rules</h2>
        <div className="mt-4 space-y-3">
          <ControlRow
            label="Require opt-in before marketing templates"
            checked
          />
          <ControlRow label="Stop sending when lead replies STOP" checked />
          <ControlRow
            label="Limit marketing retries to two per month"
            checked
          />
          <ControlRow label="Pause batch on high failure rate" checked />
        </div>
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Team and exports</h2>
        <div className="mt-4 space-y-3">
          <Input placeholder="Owner name" />
          <Input placeholder="Notification email" />
          <Select defaultValue="csv">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV export</SelectItem>
              <SelectItem value="xlsx">Excel export</SelectItem>
              <SelectItem value="crm">Push to CRM list</SelectItem>
            </SelectContent>
          </Select>
          <Button
            className="w-full"
            onClick={() =>
              setNotice('Settings storage is pending backend setup.')
            }
          >
            <Check className="size-4" />
            Save settings
          </Button>
        </div>
      </section>
    </div>
  );
}

function LeadsPanel({
  visibleLeads,
  leadFilter,
  setLeadFilter,
  setNotice,
}: {
  visibleLeads: ArchiveLead[];
  leadFilter: string;
  setLeadFilter: (filter: string) => void;
  setNotice: (notice: string) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <Tabs defaultValue="leads" className="gap-0">
        <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center xl:justify-between">
          <TabsList>
            <TabsTrigger value="leads">Main Admission archive</TabsTrigger>
            <TabsTrigger value="batches">Batch history</TabsTrigger>
            <TabsTrigger value="exports">Exports</TabsTrigger>
          </TabsList>
          <LeadToolbar
            leadFilter={leadFilter}
            setLeadFilter={setLeadFilter}
            onExport={() =>
              setNotice(
                `Prepared ${visibleLeads.length.toLocaleString()} Main Admission Calling archived leads for CSV export.`,
              )
            }
          />
        </div>

        <TabsContent value="leads" className="m-0">
          {visibleLeads.length ? (
            <LeadTable leadsToShow={visibleLeads} />
          ) : (
            <EmptyState
              icon={Archive}
              title="No rows to show"
              text="Try another archive filter or check the CRM connection."
            />
          )}
        </TabsContent>

        <TabsContent value="batches" className="m-0">
          <EmptyState
            icon={Send}
            title="No batch history yet"
            text="Batch history will appear after the campaign backend starts writing send records."
          />
        </TabsContent>

        <TabsContent value="exports" className="m-0 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <ExportCard
              title="Main Admission archive"
              count={visibleLeads.length.toLocaleString()}
              detail="Current filtered view"
              onClick={() => setNotice('Archived lead export prepared.')}
            />
            <ExportCard
              title="Clicked leads"
              count="0"
              detail="Waiting for click tracking"
              onClick={() => setNotice('Click tracking backend is pending.')}
            />
            <ExportCard
              title="Replied leads"
              count="0"
              detail="Waiting for WhatsApp webhooks"
              onClick={() => setNotice('Reply tracking backend is pending.')}
            />
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function LeadToolbar({
  leadFilter,
  setLeadFilter,
  onExport,
}: {
  leadFilter: string;
  setLeadFilter: (filter: string) => void;
  onExport: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input className="w-56 pl-8" placeholder="Search leads" />
      </div>
      <Select
        value={leadFilter}
        onValueChange={(value) => value && setLeadFilter(value)}
      >
        <SelectTrigger className="w-48">
          <Filter className="size-4" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Main Admission archived leads</SelectItem>
          <SelectItem value="high-score">High score preview</SelectItem>
          <SelectItem value="needs-phone">Needs phone cleanup</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" onClick={onExport}>
        <Download className="size-4" />
        Export leads
      </Button>
    </div>
  );
}

function TemplateComposer({
  setActiveView,
  setNotice,
}: {
  setActiveView: (view: ViewId) => void;
  setNotice: (notice: string) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Template composer</h2>
        <Badge variant="outline">Not connected</Badge>
      </div>
      <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-5 text-sm text-muted-foreground">
        No template records are stored in i-wns yet.
      </div>
      <Button
        className="mt-4 w-full"
        onClick={() => {
          setActiveView('templates');
          setNotice('Template setup opened.');
        }}
      >
        <ClipboardList className="size-4" />
        Open templates
      </Button>
    </section>
  );
}

function CrmQueue({ archive }: { archive: ArchiveResponse }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-lg font-semibold">CRM queue</h2>
      <div className="mt-4 space-y-4">
        <QueueRow
          label="Main Admission archive"
          value={archive.archiveCount.toLocaleString()}
          icon={Users}
        />
        <QueueRow
          label="Loaded preview rows"
          value={archive.leads.length.toLocaleString()}
          icon={Archive}
        />
        <QueueRow label="Available campaigns" value="0" icon={Send} />
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-muted p-3">
        <div>
          <p className="text-sm font-medium">Read-only CRM access</p>
          <p className="text-xs text-muted-foreground">
            i-wns does not write into i-crm
          </p>
        </div>
        <Switch defaultChecked />
      </div>
    </section>
  );
}

function StageBreakdown() {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-lg font-semibold">Stage breakdown</h2>
      <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
        Delivery, read, click, reply, and conversion stages will appear after
        WhatsApp event storage is added.
      </div>
    </section>
  );
}

function ActionAlerts() {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Bell className="size-4 text-[#c06f24]" />
        <h2 className="text-lg font-semibold">Action alerts</h2>
      </div>
      <div className="mt-3 space-y-3 text-sm">
        <AlertLine text="Main Admission archived leads are read-only from i-crm" />
        <AlertLine text="Create i-wns batch storage before sending" />
        <AlertLine text="Connect Meta webhooks before tracking replies" />
      </div>
    </section>
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
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-normal">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function FunnelRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{value.toLocaleString()}</span>
      </div>
      <Progress value={(value / max) * 100} className="h-2" />
    </div>
  );
}

function LeadTable({ leadsToShow }: { leadsToShow: ArchiveLead[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lead</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Last action</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leadsToShow.map((lead) => (
          <TableRow key={lead.id}>
            <TableCell>
              <div className="font-medium">{lead.name}</div>
              <div className="text-sm text-muted-foreground">
                {lead.phone} - {lead.city}
              </div>
            </TableCell>
            <TableCell>
              <div>{lead.source}</div>
              <div className="text-sm text-muted-foreground">
                {lead.company}
              </div>
            </TableCell>
            <TableCell>
              <div>{lead.stage}</div>
              <div className="text-sm text-muted-foreground">
                {lead.lastAction}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Progress value={lead.score} className="h-2 w-20" />
                <span className="text-sm">{lead.score}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{lead.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ExportCard({
  title,
  count,
  detail,
  onClick,
}: {
  title: string;
  count: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-border bg-background p-4 text-left transition hover:border-primary/50"
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold">{title}</p>
        <Download className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-3xl font-semibold">{count}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </button>
  );
}

function QueueRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">from current connection</p>
      </div>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function AlertLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 text-[#1fa463]" />
      <span>{text}</span>
      <ChevronRight className="ml-auto size-4 text-muted-foreground" />
    </div>
  );
}

function ControlRow({
  label,
  checked = false,
}: {
  label: string;
  checked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted p-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch defaultChecked={checked} />
    </div>
  );
}

function SegmentButton({
  title,
  count,
  onClick,
}: {
  title: string;
  count: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary/50"
    >
      <span className="font-medium">{title}</span>
      <Badge variant="outline">{count}</Badge>
    </button>
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

function connectionText(archive: ArchiveResponse) {
  if (archive.status === 'connected') {
    return 'read-only from i-crm';
  }
  if (archive.status === 'loading') {
    return 'loading from i-crm';
  }
  return archive.message || 'connection pending';
}
