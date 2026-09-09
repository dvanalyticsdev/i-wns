'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  Archive,
  BarChart3,
  Check,
  ClipboardList,
  Eye,
  FileSpreadsheet,
  LayoutDashboard,
  Lock,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
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
  leads: ArchiveLead[];
  collection?: string;
  archiveRule?: string;
};

type TemplateRecord = {
  id: string;
  name: string;
  category: string;
  body: string;
  mediaName: string;
  status: 'Draft' | 'Ready';
};

type BatchRecord = {
  id: string;
  name: string;
  templateId: string;
  leadIds: string[];
  sent: number;
  read: number;
  clicks: number;
  replies: number;
  converted: number;
  createdAt: string;
  status: 'Draft' | 'Sent';
};

const emptyArchive: ArchiveResponse = {
  status: 'idle',
  archiveCount: 0,
  leads: [],
};

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
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [archive, setArchive] = useState<ArchiveResponse>({
    ...emptyArchive,
    status: 'loading',
  });
  const [notice, setNotice] = useState('Loading CRM archive.');
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');

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
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-4 backdrop-blur md:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">
                  {notice}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-normal">
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
              setTemplates={setTemplates}
              setNotice={setNotice}
            />
          )}
          {activeView === 'reachout' && (
            <ReachOutView
              archive={archive}
              templates={templates}
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
              templates={templates}
              selectedReportId={selectedReportId}
              setSelectedReportId={setSelectedReportId}
              setNotice={setNotice}
            />
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
  const converted = batches.reduce((sum, batch) => sum + batch.converted, 0);
  const [templateFilter, setTemplateFilter] = useState('all');
  const trend = buildTrendData(batches, templateFilter);

  return (
    <div className="space-y-4 px-4 py-5 md:px-6">
      <section className="grid gap-3 md:grid-cols-3">
        <Metric
          icon={Archive}
          label="Archived leads"
          value={archive.archiveCount.toLocaleString()}
          detail="Main Admission Calling"
        />
        <Metric
          icon={Send}
          label="Reached out"
          value={reachedOut.toLocaleString()}
          detail="sent through i-wns"
        />
        <Metric
          icon={Check}
          label="Converted"
          value={converted.toLocaleString()}
          detail="webinar conversions"
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
  setTemplates,
  setNotice,
}: {
  templates: TemplateRecord[];
  setTemplates: (
    updater: (templates: TemplateRecord[]) => TemplateRecord[],
  ) => void;
  setNotice: (notice: string) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Marketing');
  const [body, setBody] = useState('');
  const [mediaName, setMediaName] = useState('');

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
    };
    setTemplates((current) => [template, ...current]);
    setName('');
    setBody('');
    setMediaName('');
    setNotice('Template added for this browser session.');
  }

  return (
    <div className="grid gap-4 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1fr)_430px]">
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-lg font-semibold">Templates</h2>
          <p className="text-sm text-muted-foreground">
            Manage message text and media before using a template in Reach Out.
          </p>
        </div>
        {templates.length ? (
          <div className="grid gap-3 p-4">
            {templates.map((template) => (
              <article
                key={template.id}
                className="rounded-lg border border-border bg-background p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{template.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {template.category}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {template.mediaName && (
                      <Badge variant="outline">
                        <Paperclip className="size-3" />
                        media
                      </Badge>
                    )}
                    <Badge>{template.status}</Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {template.body}
                </p>
                {template.mediaName && (
                  <p className="mt-2 text-sm font-medium">
                    {template.mediaName}
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No templates yet"
            text="Create your first WhatsApp template here. Backend persistence and Meta approval sync can be added next."
          />
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Add template</h2>
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
            Add template
          </Button>
        </div>
      </section>
    </div>
  );
}

function ReachOutView({
  archive,
  templates,
  setBatches,
  setActiveView,
  setSelectedReportId,
  setNotice,
}: {
  archive: ArchiveResponse;
  templates: TemplateRecord[];
  setBatches: (updater: (batches: BatchRecord[]) => BatchRecord[]) => void;
  setActiveView: (view: ViewId) => void;
  setSelectedReportId: (id: string) => void;
  setNotice: (notice: string) => void;
}) {
  const [batchName, setBatchName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [city, setCity] = useState('all');
  const [course, setCourse] = useState('all');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const cities = uniqueValues(archive.leads.map((lead) => lead.city));
  const courses = uniqueValues(archive.leads.map((lead) => lead.company));
  const filteredLeads = archive.leads.filter((lead) => {
    return (
      (city === 'all' || lead.city === city) &&
      (course === 'all' || lead.company === course)
    );
  });

  function toggleLead(id: string) {
    setSelectedLeadIds((current) =>
      current.includes(id)
        ? current.filter((leadId) => leadId !== id)
        : [...current, id],
    );
  }

  function sendBatch() {
    if (!batchName.trim() || !templateId || !selectedLeadIds.length) {
      setNotice('Batch name, template, and at least one lead are required.');
      return;
    }
    const batch: BatchRecord = {
      id: crypto.randomUUID(),
      name: batchName.trim(),
      templateId,
      leadIds: selectedLeadIds,
      sent: selectedLeadIds.length,
      read: 0,
      clicks: 0,
      replies: 0,
      converted: 0,
      createdAt: new Date().toLocaleString('en-IN'),
      status: 'Sent',
    };
    setBatches((current) => [batch, ...current]);
    setSelectedReportId(batch.id);
    setBatchName('');
    setSelectedLeadIds([]);
    setActiveView('reporting');
    setNotice(
      'Batch created in this session. Meta sending will be wired next.',
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
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-3">
          <Select
            value={city}
            onValueChange={(value) => value && setCity(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {cities.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={course}
            onValueChange={(value) => value && setCourse(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Course" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() =>
              setSelectedLeadIds(filteredLeads.map((lead) => lead.id))
            }
          >
            <Users className="size-4" />
            Select visible
          </Button>
        </div>
        {filteredLeads.length ? (
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
              {filteredLeads.map((lead) => (
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
              {templates.length ? (
                templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none">No templates added</SelectItem>
              )}
            </SelectContent>
          </Select>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-sm font-medium">Selected leads</p>
            <p className="text-3xl font-semibold">{selectedLeadIds.length}</p>
          </div>
          <Button
            className="w-full"
            onClick={sendBatch}
            disabled={!templates.length}
          >
            <Send className="size-4" />
            Send message
          </Button>
        </div>
      </section>
    </div>
  );
}

function ReportingView({
  batches,
  leads,
  templates,
  selectedReportId,
  setSelectedReportId,
  setNotice,
}: {
  batches: BatchRecord[];
  leads: ArchiveLead[];
  templates: TemplateRecord[];
  selectedReportId: string;
  setSelectedReportId: (id: string) => void;
  setNotice: (notice: string) => void;
}) {
  const selectedBatch =
    batches.find((batch) => batch.id === selectedReportId) || batches[0];
  const goodLeads = selectedBatch
    ? leads.filter(
        (lead) => selectedBatch.leadIds.includes(lead.id) && lead.score >= 70,
      )
    : [];

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
                <TableHead>Read</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead>Replies</TableHead>
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
                  <TableCell>{batch.read}</TableCell>
                  <TableCell>{batch.clicks}</TableCell>
                  <TableCell>{batch.replies}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedReportId(batch.id);
                        setNotice(`Opened report for ${batch.name}.`);
                      }}
                    >
                      <Eye className="size-4" />
                      View report
                    </Button>
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

      {selectedBatch && (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{selectedBatch.name}</h2>
              <p className="text-sm text-muted-foreground">
                In-depth report tab
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setNotice('Excel export prepared for good leads.')}
            >
              <FileSpreadsheet className="size-4" />
              Export Excel
            </Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <MiniMetric label="Sent" value={selectedBatch.sent} />
            <MiniMetric label="Read" value={selectedBatch.read} />
            <MiniMetric label="Clicks" value={selectedBatch.clicks} />
            <MiniMetric label="Replies" value={selectedBatch.replies} />
            <MiniMetric label="Converted" value={selectedBatch.converted} />
          </div>
          <h3 className="mt-5 font-semibold">Good leads</h3>
          {goodLeads.length ? (
            <LeadTable leadsToShow={goodLeads} />
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-border bg-background p-5 text-sm text-muted-foreground">
              No high-intent leads yet. This will fill from click, reply, and
              conversion events.
            </div>
          )}
        </section>
      )}
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
            label="Archive leads"
            value={archive.archiveCount.toLocaleString()}
            detail={connectionText(archive)}
          />
          <Metric
            icon={Archive}
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
          <ControlRow label="Pull Main Admission archive from i-crm" checked />
          <ControlRow label="Keep i-crm read-only from i-wns" checked />
          <ControlRow label="Store WhatsApp batches in i-wns only" checked />
          <Button
            className="w-full"
            onClick={() => setNotice('CRM archive refreshed.')}
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
        <h2 className="text-lg font-semibold">Access and exports</h2>
        <div className="mt-4 space-y-3">
          <Input placeholder="Notification email" />
          <Select defaultValue="xlsx">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="xlsx">Excel export</SelectItem>
              <SelectItem value="csv">CSV export</SelectItem>
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

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function LeadTable({ leadsToShow }: { leadsToShow: ArchiveLead[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lead</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Course</TableHead>
          <TableHead>Last action</TableHead>
          <TableHead>Score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leadsToShow.map((lead) => (
          <TableRow key={lead.id}>
            <TableCell>
              <div className="font-medium">{lead.name}</div>
              <div className="text-sm text-muted-foreground">{lead.phone}</div>
            </TableCell>
            <TableCell>{lead.city}</TableCell>
            <TableCell>{lead.company}</TableCell>
            <TableCell>
              <div>{lead.stage}</div>
              <div className="text-sm text-muted-foreground">
                {lead.lastAction}
              </div>
            </TableCell>
            <TableCell>{lead.score}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
      converted: batch.converted,
    }));
}

function uniqueValues(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value && value !== '-'),
    ),
  ).slice(0, 30);
}

function templateName(templates: TemplateRecord[], id: string) {
  return templates.find((template) => template.id === id)?.name || '-';
}

function connectionText(archive: ArchiveResponse) {
  if (archive.status === 'connected') return 'read-only from i-crm';
  if (archive.status === 'loading') return 'loading from i-crm';
  return archive.message || 'connection pending';
}
