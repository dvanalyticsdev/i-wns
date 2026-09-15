import {
  MongoClient,
  type AnyBulkWriteOperation,
  type Document,
  type Filter,
} from 'mongodb';

export const ARCHIVED_COUNSELOR = 'Archived Leads';
export const MAIN_ADMISSION_PIPELINE = 'main-admission';
export const DEFAULT_CRM_DB_NAME = 'i-crm-workshop';
export const DEFAULT_WNS_DB_NAME = 'i-wns';
export const DEFAULT_LEADS_COLLECTION = 'leads';
export const PAGE_SIZE = 100;
export const WNS_COURSE_OPTIONS = [
  '7DAYS_GENAI',
  'AIML + GenAI',
  'APCS',
  'APIDA',
  'APIDS',
  'DAS',
  'FDE',
  'GenAI Master',
  'Others',
];

const KNOWN_COURSE_OPTIONS = WNS_COURSE_OPTIONS.filter(
  (course) => course !== 'Others',
);

const LOCATION_ALIASES: Array<[string, string[]]> = [
  ['Agra', ['agra']],
  ['Ahmedabad', ['ahmedabad']],
  ['Ajmer', ['ajmer']],
  ['Aligarh', ['aligarh']],
  ['Allahabad', ['allahabad', 'prayagraj']],
  ['Amritsar', ['amritsar']],
  ['Aurangabad', ['aurangabad']],
  ['Bangalore', ['bangalore', 'bengaluru', 'banglore']],
  ['Bareilly', ['bareilly']],
  ['Bhopal', ['bhopal']],
  ['Bhubaneswar', ['bhubaneswar', 'bbsr']],
  ['Bikaner', ['bikaner']],
  ['Chandigarh', ['chandigarh']],
  ['Chennai', ['chennai', 'madras']],
  ['Coimbatore', ['coimbatore']],
  ['Cuttack', ['cuttack']],
  ['Dehradun', ['dehradun']],
  ['Delhi', ['delhi', 'new delhi', 'ncr']],
  ['Dhanbad', ['dhanbad']],
  ['Faridabad', ['faridabad']],
  ['Ghaziabad', ['ghaziabad']],
  ['Gorakhpur', ['gorakhpur']],
  ['Gurgaon', ['gurgaon', 'gurugram']],
  ['Guwahati', ['guwahati']],
  ['Gwalior', ['gwalior']],
  ['Hisar', ['hisar']],
  ['Hyderabad', ['hyderabad']],
  ['Indore', ['indore']],
  ['Jabalpur', ['jabalpur']],
  ['Jaipur', ['jaipur']],
  ['Jalandhar', ['jalandhar']],
  ['Jamshedpur', ['jamshedpur']],
  ['Jodhpur', ['jodhpur']],
  ['Kanpur', ['kanpur']],
  ['Kochi', ['kochi', 'cochin']],
  ['Kolkata', ['kolkata', 'calcutta']],
  ['Kota', ['kota']],
  ['Lucknow', ['lucknow']],
  ['Ludhiana', ['ludhiana']],
  ['Meerut', ['meerut']],
  ['Mumbai', ['mumbai', 'bombay']],
  ['Mysore', ['mysore', 'mysuru']],
  ['Nagpur', ['nagpur']],
  ['Nashik', ['nashik', 'nasik']],
  ['Noida', ['noida']],
  ['Patna', ['patna']],
  ['Pune', ['pune']],
  ['Raipur', ['raipur']],
  ['Rajkot', ['rajkot']],
  ['Ranchi', ['ranchi']],
  ['Surat', ['surat']],
  ['Thane', ['thane']],
  ['Udaipur', ['udaipur']],
  ['Vadodara', ['vadodara', 'baroda']],
  ['Varanasi', ['varanasi', 'banaras']],
  ['Vijayawada', ['vijayawada']],
  ['Visakhapatnam', ['visakhapatnam', 'vizag']],
];

const INVALID_LOCATION_PATTERN =
  /[_;'"`]|(?:^|\s)(?:yes|no|na|n\/a|nil|null|none|unknown|test|interested|programming|workshop|course|sql|sas)(?:\s|$)/i;

let crmClient: MongoClient | null = null;
let wnsClient: MongoClient | null = null;

export type ArchiveLead = {
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
  messageCount: number;
  isBlocked?: boolean;
  blockedAt?: Date | string;
};

export type SyncedLeadDocument = ArchiveLead & {
  crmLeadId: string;
  leadPipeline: string;
  counselor: string;
  normalizedPhone: string;
  isTestLead?: boolean;
  syncedAt: Date;
  crmUpdatedAt?: Date | string;
  crmCreatedAt?: Date | string;
};

export function crmArchiveFilter() {
  return {
    $and: [
      { counselor: new RegExp(`^${ARCHIVED_COUNSELOR}$`, 'i') },
      { leadPipeline: MAIN_ADMISSION_PIPELINE },
    ],
  };
}

export function leadProjection() {
  return {
    _id: 1,
    firstName: 1,
    lastName: 1,
    name: 1,
    fullName: 1,
    leadName: 1,
    email: 1,
    phone: 1,
    phoneNumber: 1,
    mobile: 1,
    mx_Phone: 1,
    company: 1,
    organization: 1,
    city: 1,
    source: 1,
    leadSource: 1,
    origin: 1,
    leadPipeline: 1,
    createdAt: 1,
    updatedAt: 1,
    counselor: 1,
    courseName: 1,
    workshop: 1,
    admissionStatus: 1,
    courseStatus: 1,
    wsStatus: 1,
    lastActivity: 1,
    lastActivityAt: 1,
  };
}

export function getCrmUri() {
  return process.env.CRM_MONGODB_URI || process.env.MONGODB_URI || '';
}

export function getWnsUri() {
  return process.env.WNS_MONGODB_URI || '';
}

export function getCrmDbName() {
  return process.env.CRM_MONGODB_DB_NAME || DEFAULT_CRM_DB_NAME;
}

export function getWnsDbName() {
  return process.env.WNS_MONGODB_DB_NAME || DEFAULT_WNS_DB_NAME;
}

export function getLeadCollectionName() {
  return process.env.MONGODB_LEADS_COLLECTION || DEFAULT_LEADS_COLLECTION;
}

export async function getCrmClient() {
  const uri = getCrmUri();
  if (!uri) {
    throw new Error('CRM_MONGODB_URI is not configured for i-wns sync.');
  }
  if (!crmClient) {
    crmClient = new MongoClient(uri, { maxPoolSize: 10, minPoolSize: 0 });
    await crmClient.connect();
  }
  return crmClient;
}

export async function getWnsClient() {
  const uri = getWnsUri();
  if (!uri) {
    throw new Error('WNS_MONGODB_URI is not configured for i-wns.');
  }
  if (!wnsClient) {
    wnsClient = new MongoClient(uri, { maxPoolSize: 10, minPoolSize: 0 });
    await wnsClient.connect();
  }
  return wnsClient;
}

export function buildWnsFilter({
  city,
  cities,
  course,
  courses,
  search,
}: {
  city?: string;
  cities?: string[];
  course?: string;
  courses?: string[];
  search?: string;
}) {
  const filter: Filter<SyncedLeadDocument> = {};
  const cityValues = cleanFilterValues(
    cities?.length ? cities : city ? [city] : [],
  );
  const courseValues = cleanFilterValues(
    courses?.length ? courses : course ? [course] : [],
  );
  if (cityValues.length) {
    const clauses = cityValues.map((location) =>
      location === 'Others'
        ? invalidLocationFilter()
        : { city: locationRegex(location) },
    );
    filter.$and = [...(filter.$and || []), { $or: clauses }];
  }
  if (courseValues.length) {
    const includeOthers = courseValues.includes('Others');
    const selectedKnownCourses = courseValues.filter(
      (course) => course !== 'Others',
    );
    if (includeOthers && selectedKnownCourses.length) {
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { company: { $in: selectedKnownCourses } },
            { company: { $nin: KNOWN_COURSE_OPTIONS } },
            { company: { $exists: false } },
          ],
        },
      ];
    } else if (includeOthers) {
      filter.company = { $nin: KNOWN_COURSE_OPTIONS };
    } else {
      filter.company = { $in: selectedKnownCourses };
    }
  }
  if (search?.trim()) {
    const term = escapeRegex(search.trim());
    filter.$or = [
      { name: new RegExp(term, 'i') },
      { phone: new RegExp(term, 'i') },
      { city: new RegExp(term, 'i') },
      { company: new RegExp(term, 'i') },
    ];
  }
  return filter;
}

export function toSyncedLead(doc: Document): SyncedLeadDocument {
  const lead = toArchiveLead(doc);
  return {
    ...lead,
    crmLeadId: lead.id,
    leadPipeline: MAIN_ADMISSION_PIPELINE,
    counselor: ARCHIVED_COUNSELOR,
    normalizedPhone: normalizePhone(lead.phone),
    syncedAt: new Date(),
    crmUpdatedAt: doc.updatedAt,
    crmCreatedAt: doc.createdAt,
  };
}

export function toArchiveLead(doc: Document): ArchiveLead {
  const id = String(doc.crmLeadId || doc._id || '');
  const firstName = pickText(doc, ['firstName']);
  const lastName = pickText(doc, ['lastName']);
  const composedName = [firstName, lastName].filter(Boolean).join(' ');
  const name =
    pickText(doc, ['name', 'fullName', 'leadName']) ||
    composedName ||
    'Unnamed lead';
  const stage =
    pickText(doc, [
      'admissionStatus',
      'courseStatus',
      'wsStatus',
      'leadPipeline',
      'stage',
    ]) || 'Archived';

  return {
    id,
    name,
    company:
      pickText(doc, ['company', 'organization', 'courseName', 'workshop']) ||
      'Not specified',
    phone: pickText(doc, ['phone', 'phoneNumber', 'mobile', 'mx_Phone']) || '-',
    city: pickText(doc, ['city']) || '-',
    source: pickText(doc, ['leadSource', 'source', 'origin']) || 'CRM archive',
    stage,
    lastAction:
      pickText(doc, ['lastAction', 'lastActivity']) ||
      formatDate(
        pickText(doc, [
          'lastActivityAt',
          'updatedAt',
          'crmUpdatedAt',
          'createdAt',
          'crmCreatedAt',
        ]),
      ) ||
      'No recent activity',
    status: pickText(doc, ['status']) || 'Archived',
    score: typeof doc.score === 'number' ? doc.score : scoreLead(stage),
    messageCount: Number(doc.messageCount || 0),
    isBlocked: Boolean(doc.isBlocked || doc.blockedAt),
    blockedAt: doc.blockedAt as Date | string | undefined,
  };
}

export function toBulkOperation(
  lead: SyncedLeadDocument,
): AnyBulkWriteOperation<SyncedLeadDocument> {
  return {
    updateOne: {
      filter: { crmLeadId: lead.crmLeadId },
      update: {
        $set: lead,
        $setOnInsert: {
          reachedOut: false,
          createdInWnsAt: new Date(),
        },
      },
      upsert: true,
    },
  };
}

export function cleanLocationOptions(values: unknown[]) {
  const options = new Set<string>();
  let hasOthers = false;
  for (const value of values) {
    const normalized = normalizeLocationOption(value);
    if (normalized) {
      options.add(normalized);
    } else {
      hasOthers = true;
    }
  }
  return [
    ...Array.from(options).sort((a, b) => a.localeCompare(b)),
    ...(hasOthers ? ['Others'] : []),
  ];
}

function normalizeLocationOption(value: unknown) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw || raw === '-' || INVALID_LOCATION_PATTERN.test(raw)) return '';
  const compact = raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z\s,()/-]/g, ' ')
    .replace(/\b(?:india|bharat|state|dist|district|city|rajasthan|odisha|orissa|maharashtra|karnataka|tamil nadu|telangana|bihar|uttar pradesh|up|haryana|punjab|gujarat|west bengal|wb)\b/g, ' ')
    .replace(/[/,()_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact || compact.length < 2 || compact.length > 40) return '';
  if (!/[aeiou]/.test(compact)) return '';

  for (const [city, aliases] of LOCATION_ALIASES) {
    if (aliases.some((alias) => matchesLocationTerm(compact, alias))) {
      return city;
    }
  }
  return '';
}

function matchesLocationTerm(value: string, term: string) {
  return new RegExp(`(^|\\s)${escapeRegex(term)}(\\s|$)`, 'i').test(value);
}

function locationRegex(location: string) {
  const aliases =
    LOCATION_ALIASES.find(([city]) => city === location)?.[1] || [location];
  return new RegExp(aliases.map(escapeRegex).join('|'), 'i');
}

function invalidLocationFilter() {
  return {
    $or: [
      { city: { $exists: false } },
      { city: '' },
      { city: '-' },
      { city: { $not: knownLocationRegex() } },
    ],
  };
}

function knownLocationRegex() {
  return new RegExp(
    LOCATION_ALIASES.flatMap(([, aliases]) => aliases)
      .map(escapeRegex)
      .join('|'),
    'i',
  );
}

function pickText(doc: Document, keys: string[]) {
  for (const key of keys) {
    const value = doc[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
  }
  return '';
}

function formatDate(value: string) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `Updated ${date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}`;
}

function scoreLead(stage: string) {
  const normalized = stage.toLowerCase();
  if (normalized.includes('interested') || normalized.includes('won')) {
    return 80;
  }
  if (normalized.includes('not interested') || normalized.includes('lost')) {
    return 20;
  }
  return 50;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanFilterValues(values: string[]) {
  return values
    .map((value) => value.trim())
    .filter((value) => value && value !== 'all');
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, '');
}
