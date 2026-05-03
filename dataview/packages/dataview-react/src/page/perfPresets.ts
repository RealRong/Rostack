import type { Engine } from '@dataview/engine'
import type {
  CalculationMetric,
  CustomField,
  DataDoc,
  DataRecord,
  DateValue,
  FieldId,
  Filter,
  FilterRule,
  GalleryOptions,
  KanbanOptions,
  Sort,
  SortDirection,
  SortRule,
  TableOptions,
  View,
  ViewGroup,
  ViewOptionsByType,
  ViewType
} from '@dataview/core/types'
import { entityTable } from '@shared/core'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import {
  document
} from '@dataview/core/document'
import {
  view
} from '@dataview/core/view'
import {
  replaceViewOrder
} from '@dataview/core/view/order'
import type {
  MenuItem
} from '@shared/ui/menu'

const PERF_PRESET_META_KEY = 'dataviewPerfPreset'
const DAY_MS = 24 * 60 * 60 * 1000
const ANCHOR_DATE_UTC = Date.UTC(2026, 3, 15, 12, 0, 0)

export type PerfPresetId =
  | 'roadmap-1k'
  | 'roadmap-10k'
  | 'sales-20k'
  | 'content-10k'
  | 'engineering-50k'
  | 'dense-20k'

interface PerfPresetMeta {
  id: PerfPresetId
  label: string
  groupLabel: string
  recordCount: number
  seed: number
  summary: string
  generatedAt: string
}

interface PerfPresetDefinition {
  id: PerfPresetId
  label: string
  menuLabel: string
  groupKey: string
  groupLabel: string
  recordCount: number
  seed: number
  summary: string
  createDocument: () => DataDoc
}

interface WeightedValue<T> {
  value: T
  weight: number
}

interface RandomSource {
  next: () => number
  int: (min: number, max: number) => number
  chance: (probability: number) => boolean
  pick: <T>(items: readonly T[]) => T
  weighted: <T>(items: readonly WeightedValue<T>[]) => T
}

type FlatOption = {
  id: string
  name: string
  color: string | null
}

type StatusOption = FlatOption & {
  category: 'todo' | 'in_progress' | 'complete'
}

const formatCompactCount = (value: number) => (
  value >= 1000
    ? `${Math.round(value / 1000)}k`
    : String(value)
)

export const formatPerfPresetCount = (value: number) => new Intl.NumberFormat('en-US').format(value)

const buildRecordId = (index: number) => `rec_${String(index + 1).padStart(6, '0')}`

const createSeededRandom = (seed: number): RandomSource => {
  let state = seed >>> 0
  const next = () => {
    state += 0x6D2B79F5
    let current = state
    current = Math.imul(current ^ (current >>> 15), current | 1)
    current ^= current + Math.imul(current ^ (current >>> 7), current | 61)
    return ((current ^ (current >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    chance: probability => next() < probability,
    pick: items => {
      if (!items.length) {
        throw new Error('Cannot pick from an empty list.')
      }
      return items[Math.floor(next() * items.length)]
    },
    weighted: items => {
      if (!items.length) {
        throw new Error('Cannot pick from an empty weighted list.')
      }

      const total = items.reduce((sum, item) => sum + item.weight, 0)
      let threshold = next() * total

      for (const item of items) {
        threshold -= item.weight
        if (threshold <= 0) {
          return item.value
        }
      }

      return items[items.length - 1]!.value
    }
  }
}

const createEntityTable = <T extends {
  id: string
}>(items: readonly T[]) => entityTable.normalize.list(items)

type SortSeed = {
  fieldId?: FieldId
  direction?: SortDirection
}

const createEmptyFilter = (): Filter => ({
  mode: 'and',
  rules: []
})

const createSort = (
  viewId: string,
  rules: readonly SortSeed[] | undefined
): Sort => ({
  rules: (rules ?? []).map((rule, index) => {
    const fieldId = rule.fieldId
    if (!fieldId) {
      throw new Error(`Sort preset at ${viewId}[${index}] is missing fieldId`)
    }

    return {
      id: `${viewId}_sort_${index + 1}`,
      fieldId,
      direction: rule.direction === 'desc' ? 'desc' : 'asc'
    } satisfies SortRule
  })
})

const createTextField = (
  id: string,
  name: string
): CustomField => ({
  id,
  name,
  kind: 'text'
})

const createNumberField = (
  id: string,
  name: string,
  input: {
    format?: 'number' | 'integer' | 'percent' | 'currency'
    currency?: string | null
    precision?: number | null
    useThousandsSeparator?: boolean
  } = {}
): CustomField => ({
  id,
  name,
  kind: 'number',
  format: input.format ?? 'number',
  precision: input.precision ?? null,
  currency: input.currency ?? null,
  useThousandsSeparator: input.useThousandsSeparator ?? true
})

const createSelectField = (
  id: string,
  name: string,
  options: readonly FlatOption[]
): CustomField => ({
  id,
  name,
  kind: 'select',
  options: options.map(option => ({ ...option }))
})

const createMultiSelectField = (
  id: string,
  name: string,
  options: readonly FlatOption[]
): CustomField => ({
  id,
  name,
  kind: 'multiSelect',
  options: options.map(option => ({ ...option }))
})

const createStatusField = (
  id: string,
  name: string,
  options: readonly StatusOption[]
): CustomField => ({
  id,
  name,
  kind: 'status',
  defaultOptionId: options[0]?.id ?? null,
  options: options.map(option => ({ ...option }))
})

const createDateField = (
  id: string,
  name: string
): CustomField => ({
  id,
  name,
  kind: 'date',
  displayDateFormat: 'short',
  displayTimeFormat: '24h',
  defaultValueKind: 'date',
  defaultTimezone: null
})

function patchViewOptions (
  type: 'table',
  fields: readonly CustomField[],
  patch?: {
    table?: Partial<TableOptions>
    gallery?: Partial<GalleryOptions>
    kanban?: Partial<KanbanOptions>
  }
): TableOptions
function patchViewOptions (
  type: 'gallery',
  fields: readonly CustomField[],
  patch?: {
    table?: Partial<TableOptions>
    gallery?: Partial<GalleryOptions>
    kanban?: Partial<KanbanOptions>
  }
): GalleryOptions
function patchViewOptions (
  type: 'kanban',
  fields: readonly CustomField[],
  patch?: {
    table?: Partial<TableOptions>
    gallery?: Partial<GalleryOptions>
    kanban?: Partial<KanbanOptions>
  }
): KanbanOptions
function patchViewOptions (
  type: ViewType,
  fields: readonly CustomField[],
  patch: {
    table?: Partial<TableOptions>
    gallery?: Partial<GalleryOptions>
    kanban?: Partial<KanbanOptions>
  } = {}
): ViewOptionsByType[ViewType] {
  switch (type) {
    case 'table': {
      const base = view.options.defaults('table', fields)
      return {
        ...base,
        ...patch.table
      }
    }
    case 'gallery': {
      const base = view.options.defaults('gallery', fields)
      return {
        ...base,
        ...patch.gallery,
        card: {
          ...base.card,
          ...patch.gallery?.card
        }
      }
    }
    case 'kanban': {
      const base = view.options.defaults('kanban', fields)
      return {
        ...base,
        ...patch.kanban,
        card: {
          ...base.card,
          ...patch.kanban?.card
        }
      }
    }
  }
}

const createView = (input: {
  id: string
  type: ViewType
  name: string
  schemaFields: readonly CustomField[]
  fields: readonly FieldId[]
  sort?: readonly SortSeed[]
  group?: ViewGroup
  calc?: Partial<Record<FieldId, CalculationMetric>>
  filter?: Filter
  options?: {
    table?: Partial<TableOptions>
    gallery?: Partial<GalleryOptions>
    kanban?: Partial<KanbanOptions>
  }
}): View => {
  const base = {
    id: input.id,
    name: input.name,
    search: {
      query: ''
    },
    filter: input.filter ?? createEmptyFilter(),
    sort: createSort(input.id, input.sort),
    calc: {
      ...(input.calc ?? {})
    },
    fields: [...input.fields],
    order: replaceViewOrder([])
  }

  switch (input.type) {
    case 'table':
      return {
        ...base,
        type: 'table',
        ...(input.group
          ? {
              group: {
                ...input.group
              }
            }
          : {}),
        options: patchViewOptions('table', input.schemaFields, input.options)
      }
    case 'gallery':
      return {
        ...base,
        type: 'gallery',
        ...(input.group
          ? {
              group: {
                ...input.group
              }
            }
          : {}),
        options: patchViewOptions('gallery', input.schemaFields, input.options)
      }
    case 'kanban':
      return {
        ...base,
        type: 'kanban',
        group: input.group
          ? {
              ...input.group
            }
          : {
              fieldId: 'status',
              mode: 'category',
              bucketSort: 'manual'
            },
        options: patchViewOptions('kanban', input.schemaFields, input.options)
      }
  }
}

const createDateValue = (offsetDays: number): DateValue => ({
  kind: 'date',
  start: new Date(ANCHOR_DATE_UTC + (offsetDays * DAY_MS)).toISOString().slice(0, 10)
})

const putValue = (
  values: Record<string, unknown>,
  fieldId: string,
  value: unknown | undefined
) => {
  if (value !== undefined) {
    values[fieldId] = value
  }
}

const pickWeightedUnique = <T,>(
  random: RandomSource,
  source: readonly WeightedValue<T>[],
  count: number
) => {
  const available = source.slice()
  const picked: T[] = []

  while (picked.length < count && available.length > 0) {
    const value = random.weighted(available)
    const index = available.findIndex(item => Object.is(item.value, value))
    if (index >= 0) {
      available.splice(index, 1)
    }
    picked.push(value)
  }

  return picked
}

const maybeLongTitle = (
  random: RandomSource,
  title: string,
  tails: readonly string[]
) => (
  random.chance(0.06)
    ? `${title} ${random.pick(tails)}`
    : title
)

const COMPANY_POOL = [
  'Northwind',
  'Aperture Cloud',
  'Granite Health',
  'Atlas Commerce',
  'Lumen Labs',
  'Bluepeak Systems',
  'Harbor Retail',
  'Summit Bio',
  'Verge Capital',
  'Pixel Harbor',
  'Cinder Mobility',
  'Signal Ops',
  'Helio Robotics',
  'Crestline Media',
  'Nimbus Energy',
  'Oakwell Legal'
] as const

const OWNER_POOL = [
  'Annie Case',
  'Mason Lee',
  'Priya Raman',
  'Elena Park',
  'Theo Martin',
  'Nina Alvarez',
  'Owen Brooks',
  'Iris Chen',
  'Noah Singh',
  'Sofia Turner',
  'Marcus Bell',
  'Leah Kim'
] as const

const TEAM_POOL = [
  'Core Product',
  'Growth',
  'Revenue Systems',
  'Customer Experience',
  'Platform',
  'Mobile',
  'Data & Insights'
] as const

const ROADMAP_STATUS_OPTIONS = [
  {
    id: 'backlog',
    name: 'Backlog',
    color: 'gray',
    category: 'todo'
  },
  {
    id: 'planned',
    name: 'Planned',
    color: 'amber',
    category: 'todo'
  },
  {
    id: 'in_progress',
    name: 'In Progress',
    color: 'blue',
    category: 'in_progress'
  },
  {
    id: 'review',
    name: 'Review',
    color: 'purple',
    category: 'in_progress'
  },
  {
    id: 'launched',
    name: 'Launched',
    color: 'green',
    category: 'complete'
  }
] as const satisfies readonly StatusOption[]

const PRIORITY_OPTIONS = [
  {
    id: 'urgent',
    name: 'Urgent',
    color: 'red'
  },
  {
    id: 'high',
    name: 'High',
    color: 'orange'
  },
  {
    id: 'medium',
    name: 'Medium',
    color: 'blue'
  },
  {
    id: 'low',
    name: 'Low',
    color: 'gray'
  }
] as const satisfies readonly FlatOption[]

const ROADMAP_INITIATIVE_OPTIONS = [
  {
    id: 'enterprise_expansion',
    name: 'Enterprise Expansion',
    color: 'blue'
  },
  {
    id: 'self_serve_growth',
    name: 'Self-Serve Growth',
    color: 'green'
  },
  {
    id: 'platform_trust',
    name: 'Platform Trust',
    color: 'amber'
  },
  {
    id: 'ai_workflows',
    name: 'AI Workflows',
    color: 'purple'
  },
  {
    id: 'mobile_uplift',
    name: 'Mobile Uplift',
    color: 'pink'
  }
] as const satisfies readonly FlatOption[]

const TAG_OPTIONS = [
  {
    id: 'research',
    name: 'Research',
    color: 'blue'
  },
  {
    id: 'mobile',
    name: 'Mobile',
    color: 'green'
  },
  {
    id: 'platform',
    name: 'Platform',
    color: 'purple'
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    color: 'amber'
  },
  {
    id: 'growth',
    name: 'Growth',
    color: 'orange'
  },
  {
    id: 'migration',
    name: 'Migration',
    color: 'red'
  },
  {
    id: 'security',
    name: 'Security',
    color: 'gray'
  },
  {
    id: 'localization',
    name: 'Localization',
    color: 'pink'
  }
] as const satisfies readonly FlatOption[]

const SALES_STAGE_OPTIONS = [
  {
    id: 'lead',
    name: 'Lead',
    color: 'gray',
    category: 'todo'
  },
  {
    id: 'qualified',
    name: 'Qualified',
    color: 'amber',
    category: 'todo'
  },
  {
    id: 'proposal',
    name: 'Proposal',
    color: 'blue',
    category: 'in_progress'
  },
  {
    id: 'negotiation',
    name: 'Negotiation',
    color: 'purple',
    category: 'in_progress'
  },
  {
    id: 'won',
    name: 'Won',
    color: 'green',
    category: 'complete'
  },
  {
    id: 'lost',
    name: 'Lost',
    color: 'red',
    category: 'complete'
  }
] as const satisfies readonly StatusOption[]

const CONTENT_STATUS_OPTIONS = [
  {
    id: 'idea',
    name: 'Idea',
    color: 'gray',
    category: 'todo'
  },
  {
    id: 'scheduled',
    name: 'Scheduled',
    color: 'amber',
    category: 'todo'
  },
  {
    id: 'in_production',
    name: 'In Production',
    color: 'blue',
    category: 'in_progress'
  },
  {
    id: 'review',
    name: 'Review',
    color: 'purple',
    category: 'in_progress'
  },
  {
    id: 'live',
    name: 'Live',
    color: 'green',
    category: 'complete'
  }
] as const satisfies readonly StatusOption[]

const ENGINEERING_STATUS_OPTIONS = [
  {
    id: 'todo',
    name: 'Todo',
    color: 'gray',
    category: 'todo'
  },
  {
    id: 'in_progress',
    name: 'In Progress',
    color: 'blue',
    category: 'in_progress'
  },
  {
    id: 'blocked',
    name: 'Blocked',
    color: 'red',
    category: 'in_progress'
  },
  {
    id: 'review',
    name: 'Review',
    color: 'purple',
    category: 'in_progress'
  },
  {
    id: 'done',
    name: 'Done',
    color: 'green',
    category: 'complete'
  }
] as const satisfies readonly StatusOption[]

const CHANNEL_OPTIONS = [
  {
    id: 'email',
    name: 'Email',
    color: 'blue'
  },
  {
    id: 'blog',
    name: 'Blog',
    color: 'green'
  },
  {
    id: 'webinar',
    name: 'Webinar',
    color: 'purple'
  },
  {
    id: 'social',
    name: 'Social',
    color: 'pink'
  },
  {
    id: 'paid',
    name: 'Paid',
    color: 'amber'
  }
] as const satisfies readonly FlatOption[]

const SALES_REGION_OPTIONS = [
  {
    id: 'north_america',
    name: 'North America',
    color: 'blue'
  },
  {
    id: 'emea',
    name: 'EMEA',
    color: 'green'
  },
  {
    id: 'apac',
    name: 'APAC',
    color: 'purple'
  }
] as const satisfies readonly FlatOption[]

const SEGMENT_OPTIONS = [
  {
    id: 'enterprise',
    name: 'Enterprise',
    color: 'red'
  },
  {
    id: 'mid_market',
    name: 'Mid-Market',
    color: 'amber'
  },
  {
    id: 'smb',
    name: 'SMB',
    color: 'blue'
  }
] as const satisfies readonly FlatOption[]

const CONTENT_CAMPAIGN_OPTIONS = [
  {
    id: 'spring_launch',
    name: 'Spring Launch',
    color: 'pink'
  },
  {
    id: 'q2_pipeline',
    name: 'Q2 Pipeline',
    color: 'blue'
  },
  {
    id: 'customer_stories',
    name: 'Customer Stories',
    color: 'green'
  },
  {
    id: 'ai_week',
    name: 'AI Week',
    color: 'purple'
  }
] as const satisfies readonly FlatOption[]

const CONTENT_TYPE_OPTIONS = [
  {
    id: 'article',
    name: 'Article',
    color: 'blue'
  },
  {
    id: 'video',
    name: 'Video',
    color: 'red'
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    color: 'green'
  },
  {
    id: 'case_study',
    name: 'Case Study',
    color: 'purple'
  }
] as const satisfies readonly FlatOption[]

const ENGINEERING_COMPONENT_OPTIONS = [
  {
    id: 'editor',
    name: 'Editor',
    color: 'blue'
  },
  {
    id: 'sync',
    name: 'Sync',
    color: 'green'
  },
  {
    id: 'dataview',
    name: 'DataView',
    color: 'purple'
  },
  {
    id: 'search',
    name: 'Search',
    color: 'amber'
  },
  {
    id: 'auth',
    name: 'Auth',
    color: 'red'
  }
] as const satisfies readonly FlatOption[]

const SPRINT_OPTIONS = [
  {
    id: 'sprint_17',
    name: 'Sprint 17',
    color: 'gray'
  },
  {
    id: 'sprint_18',
    name: 'Sprint 18',
    color: 'blue'
  },
  {
    id: 'sprint_19',
    name: 'Sprint 19',
    color: 'green'
  },
  {
    id: 'backlog',
    name: 'Backlog',
    color: 'amber'
  }
] as const satisfies readonly FlatOption[]

const SEVERITY_OPTIONS = [
  {
    id: 'sev_1',
    name: 'SEV-1',
    color: 'red'
  },
  {
    id: 'sev_2',
    name: 'SEV-2',
    color: 'orange'
  },
  {
    id: 'sev_3',
    name: 'SEV-3',
    color: 'amber'
  },
  {
    id: 'sev_4',
    name: 'SEV-4',
    color: 'gray'
  }
] as const satisfies readonly FlatOption[]

const DENSE_REGION_OPTIONS = [
  {
    id: 'amer',
    name: 'AMER',
    color: 'blue'
  },
  {
    id: 'emea',
    name: 'EMEA',
    color: 'green'
  },
  {
    id: 'apac',
    name: 'APAC',
    color: 'purple'
  },
  {
    id: 'latam',
    name: 'LATAM',
    color: 'pink'
  }
] as const satisfies readonly FlatOption[]

const DENSE_SEGMENT_OPTIONS = [
  {
    id: 'cohort_a',
    name: 'Cohort A',
    color: 'blue'
  },
  {
    id: 'cohort_b',
    name: 'Cohort B',
    color: 'green'
  },
  {
    id: 'cohort_c',
    name: 'Cohort C',
    color: 'purple'
  },
  {
    id: 'cohort_d',
    name: 'Cohort D',
    color: 'amber'
  }
] as const satisfies readonly FlatOption[]

const DENSE_SOURCE_OPTIONS = [
  {
    id: 'partner',
    name: 'Partner',
    color: 'green'
  },
  {
    id: 'paid',
    name: 'Paid',
    color: 'amber'
  },
  {
    id: 'organic',
    name: 'Organic',
    color: 'blue'
  },
  {
    id: 'expansion',
    name: 'Expansion',
    color: 'purple'
  }
] as const satisfies readonly FlatOption[]

const ROADMAP_REPEATED_TITLES = [
  'Launch usage-based billing for enterprise workspaces',
  'Streamline approval flows for multi-team launches',
  'Expand AI assistant coverage across weekly planning rituals',
  'Stabilize mobile publishing workflows for distributed teams'
] as const

const ROADMAP_TITLE_TAILS = [
  'with regional rollout controls',
  'before the next enterprise design review',
  'without slowing down shared workspace onboarding',
  'for high-growth product and revenue teams'
] as const

const ROADMAP_VERBS = [
  'Launch',
  'Expand',
  'Automate',
  'Unify',
  'Redesign',
  'Improve',
  'Scale',
  'Stabilize'
] as const

const ROADMAP_OBJECTS = [
  'workspace approvals',
  'usage-based billing',
  'cross-team planning',
  'customer-facing dashboards',
  'AI suggestions',
  'release handoffs',
  'mobile review loops',
  'admin controls'
] as const

const ROADMAP_QUALIFIERS = [
  'for enterprise workspaces',
  'across global teams',
  'for expansion accounts',
  'with stronger trust signals',
  'before Q3 launch planning',
  'for higher conversion in onboarding'
] as const

const ENGINEERING_REPEATED_TITLES = [
  'Stabilize grouped summary snapshot recompute path',
  'Fix selection drift after replacing active document',
  'Reduce row rail hover invalidation during marquee updates',
  'Prevent option summary recompute from thrashing under large datasets'
] as const

const ENGINEERING_TITLE_TAILS = [
  'without regressing table virtualization',
  'under mixed selection and hover states',
  'for high-cardinality grouped views',
  'before the next release candidate cut'
] as const

const buildRoadmapTitle = (
  random: RandomSource
) => maybeLongTitle(
  random,
  random.chance(0.14)
    ? random.pick(ROADMAP_REPEATED_TITLES)
    : `${random.pick(ROADMAP_VERBS)} ${random.pick(ROADMAP_OBJECTS)} ${random.pick(ROADMAP_QUALIFIERS)}`,
  ROADMAP_TITLE_TAILS
)

const buildSalesTitle = (
  random: RandomSource,
  company: string
) => maybeLongTitle(
  random,
  `${company} ${random.pick([
    'renewal expansion',
    'platform rollout',
    'regional upsell',
    'global procurement review',
    'multi-year consolidation',
    'services attachment'
  ] as const)}`,
  [
    'covering North America and EMEA stakeholders',
    'ahead of the executive budget cycle',
    'with revised procurement timing',
    'before the next board-ready pipeline review'
  ]
)

const buildContentTitle = (
  random: RandomSource,
  campaign: string,
  channel: string
) => maybeLongTitle(
  random,
  `${campaign}: ${random.pick([
    'launch narrative',
    'customer proof series',
    'product update recap',
    'pipeline acceleration brief',
    'market positioning story'
  ] as const)} for ${channel}`,
  [
    'with a stronger executive angle',
    'adapted for regional audiences',
    'paired with follow-up social cutdowns',
    'for the next content performance review'
  ]
)

const buildEngineeringTitle = (
  random: RandomSource,
  component: string
) => maybeLongTitle(
  random,
  random.chance(0.16)
    ? random.pick(ENGINEERING_REPEATED_TITLES)
    : `${random.pick([
      'Fix',
      'Refactor',
      'Harden',
      'Reduce',
      'Improve',
      'Stabilize',
      'Profile'
    ] as const)} ${component} ${random.pick([
      'selection sync',
      'view hydration',
      'aggregation pipeline',
      'hover state churn',
      'group bucket reconciliation',
      'virtual list update path'
    ] as const)}`,
  ENGINEERING_TITLE_TAILS
)

const buildDenseTitle = (
  random: RandomSource,
  segment: string,
  region: string
) => maybeLongTitle(
  random,
  `${segment} ${region} ${random.pick([
    'variance review',
    'forecast checkpoint',
    'quality threshold audit',
    'conversion cohort analysis',
    'pipeline efficiency scorecard'
  ] as const)}`,
  [
    'with partner-source outlier checks',
    'for the weekly operating cadence',
    'before the monthly business review',
    'against rolling 90-day baselines'
  ]
)

const buildRoadmapSummary = (
  initiative: string,
  team: string
) => `${initiative} workstream coordinated by ${team}, focused on rollout quality, stakeholder visibility, and smoother launch operations.`

const buildSalesSummary = (
  company: string,
  owner: string
) => `Advance the ${company} account through executive alignment, procurement timing, and a clearer multi-region rollout plan with ${owner}.`

const buildContentSummary = (
  campaign: string,
  owner: string
) => `${campaign} content package led by ${owner}, balancing publishing velocity, localization, and performance follow-through across channels.`

const buildEngineeringSummary = (
  component: string,
  sprint: string
) => `Focus on ${component} reliability, reduce regressions, and keep the fix set small enough to land cleanly before ${sprint}.`

const buildDenseSummary = (
  segment: string,
  channel: string
) => `Monitor ${segment} changes against ${channel} baselines, flag long-tail outliers, and keep leadership-ready metrics stable under large slices.`

const weightedTagPool = TAG_OPTIONS.map(option => ({
  value: option.id,
  weight: option.id === 'platform' || option.id === 'growth' || option.id === 'enterprise'
    ? 4
    : option.id === 'security' || option.id === 'migration'
      ? 2
      : 3
}))

const pickTags = (
  random: RandomSource
) => {
  const tagCount = random.weighted<number>([
    {
      value: 0,
      weight: 35
    },
    {
      value: 1,
      weight: 40
    },
    {
      value: 2,
      weight: 20
    },
    {
      value: 3,
      weight: 5
    }
  ])

  return tagCount > 0
    ? pickWeightedUnique(random, weightedTagPool, tagCount)
    : undefined
}

const createRoadmapDocument = (recordCount: number, seed: number): DataDoc => {
  const random = createSeededRandom(seed)
  const ownerOptions = OWNER_POOL.map((name, index) => ({
    id: `owner_${index + 1}`,
    name,
    color: index % 2 === 0 ? 'blue' : 'green'
  }))
  const teamOptions = TEAM_POOL.map((name, index) => ({
    id: `team_${index + 1}`,
    name,
    color: index % 2 === 0 ? 'purple' : 'amber'
  }))

  const fields: CustomField[] = [
    createStatusField('status', 'Status', ROADMAP_STATUS_OPTIONS),
    createSelectField('priority', 'Priority', PRIORITY_OPTIONS),
    createSelectField('owner', 'Owner', ownerOptions),
    createSelectField('team', 'Team', teamOptions),
    createSelectField('initiative', 'Initiative', ROADMAP_INITIATIVE_OPTIONS),
    createMultiSelectField('tags', 'Tags', TAG_OPTIONS),
    createDateField('targetDate', 'Target Date'),
    createNumberField('storyPoints', 'Story Points', {
      format: 'integer',
      precision: 0
    }),
    createNumberField('confidence', 'Confidence', {
      format: 'percent',
      precision: 0
    }),
    createTextField('summary', 'Summary')
  ]

  const records: DataRecord[] = []

  for (let index = 0; index < recordCount; index += 1) {
    const status = random.weighted<string>([
      {
        value: 'backlog',
        weight: 28
      },
      {
        value: 'planned',
        weight: 24
      },
      {
        value: 'in_progress',
        weight: 22
      },
      {
        value: 'review',
        weight: 12
      },
      {
        value: 'launched',
        weight: 14
      }
    ])
    const priority = random.weighted<string>([
      {
        value: 'urgent',
        weight: 8
      },
      {
        value: 'high',
        weight: 22
      },
      {
        value: 'medium',
        weight: 48
      },
      {
        value: 'low',
        weight: 22
      }
    ])
    const owner = random.weighted<string>(ownerOptions.map((option, index) => ({
      value: option.id,
      weight: index < 4 ? 5 : 2
    })))
    const team = random.weighted<string>(teamOptions.map((option, index) => ({
      value: option.id,
      weight: index < 3 ? 4 : 2
    })))
    const initiative = random.weighted<string>(ROADMAP_INITIATIVE_OPTIONS.map((option, index) => ({
      value: option.id,
      weight: index === 0 || index === 3 ? 4 : 2
    })))
    const values: Record<string, unknown> = {
      status,
      priority,
      owner,
      team,
      initiative
    }

    putValue(values, 'tags', pickTags(random))
    putValue(values, 'storyPoints', random.weighted<number>([
      {
        value: 1,
        weight: 12
      },
      {
        value: 2,
        weight: 18
      },
      {
        value: 3,
        weight: 22
      },
      {
        value: 5,
        weight: 24
      },
      {
        value: 8,
        weight: 16
      },
      {
        value: 13,
        weight: 6
      },
      {
        value: 21,
        weight: 2
      }
    ]))
    if (random.chance(0.82)) {
      const offset = status === 'launched'
        ? random.int(-120, -5)
        : random.int(7, 180)
      values.targetDate = createDateValue(offset)
    }
    if (random.chance(0.76)) {
      values.confidence = random.int(56, 97)
    }
    if (random.chance(0.62)) {
      const initiativeLabel = ROADMAP_INITIATIVE_OPTIONS.find(option => option.id === initiative)?.name ?? 'Roadmap'
      const teamLabel = teamOptions.find(option => option.id === team)?.name ?? 'Team'
      values.summary = buildRoadmapSummary(initiativeLabel, teamLabel)
    }

    records.push({
      id: buildRecordId(index),
      title: buildRoadmapTitle(random),
      type: 'initiative',
      values
    })
  }

  const tableView = createView({
    id: 'view_roadmap_table',
    type: 'table',
    name: 'Roadmap',
    schemaFields: fields,
    fields: [
      TITLE_FIELD_ID,
      'status',
      'priority',
      'owner',
      'team',
      'initiative',
      'targetDate',
      'storyPoints',
      'confidence',
      'tags'
    ],
    sort: [{
      fieldId: 'targetDate',
      direction: 'asc'
    }],
    calc: {
      status: 'countByOption',
      priority: 'countByOption',
      storyPoints: 'sum',
      tags: 'countByOption'
    }
  })
  const boardView = createView({
    id: 'view_roadmap_board',
    type: 'kanban',
    name: 'By Status',
    schemaFields: fields,
    fields: [
      'owner',
      'initiative',
      'targetDate',
      'tags'
    ],
    group: {
      fieldId: 'status',
      mode: 'option',
      bucketSort: 'manual',
      showEmpty: true
    }
  })
  const galleryView = createView({
    id: 'view_roadmap_gallery',
    type: 'gallery',
    name: 'Highlights',
    schemaFields: fields,
    fields: [
      'status',
      'priority',
      'owner',
      'targetDate',
      'summary'
    ],
    sort: [{
      fieldId: 'priority',
      direction: 'asc'
    }],
    options: {
      gallery: {
        card: {
          wrap: false,
          size: 'lg',
          layout: 'stacked'
        }
      }
    }
  })

  return document.normalize({
    activeViewId: tableView.id,
    fields: createEntityTable(fields),
    views: createEntityTable([tableView, boardView, galleryView]),
    records: createEntityTable(records),
    meta: {
      [PERF_PRESET_META_KEY]: {
        id: recordCount === 1000 ? 'roadmap-1k' : 'roadmap-10k',
        label: `产品路线图 ${formatCompactCount(recordCount)}`,
        groupLabel: '产品路线图',
        recordCount,
        seed,
        summary: '偏 SaaS 的产品规划场景，适合演示 table / kanban / gallery 切换与 summary。',
        generatedAt: new Date().toISOString()
      } satisfies PerfPresetMeta
    }
  })
}

const createSalesDocument = (recordCount: number, seed: number): DataDoc => {
  const random = createSeededRandom(seed)
  const ownerOptions = OWNER_POOL.map((name, index) => ({
    id: `ae_${index + 1}`,
    name,
    color: index % 2 === 0 ? 'blue' : 'green'
  }))
  const fields: CustomField[] = [
    createStatusField('stage', 'Stage', SALES_STAGE_OPTIONS),
    createTextField('company', 'Company'),
    createSelectField('owner', 'Owner', ownerOptions),
    createSelectField('region', 'Region', SALES_REGION_OPTIONS),
    createSelectField('segment', 'Segment', SEGMENT_OPTIONS),
    createMultiSelectField('tags', 'Tags', TAG_OPTIONS),
    createNumberField('expectedRevenue', 'Expected Revenue', {
      format: 'currency',
      currency: 'USD'
    }),
    createNumberField('healthScore', 'Health Score', {
      format: 'number',
      precision: 0
    }),
    createDateField('closeDate', 'Close Date'),
    createTextField('nextStep', 'Next Step')
  ]

  const records: DataRecord[] = []

  for (let index = 0; index < recordCount; index += 1) {
    const company = random.pick(COMPANY_POOL)
    const stage = random.weighted<string>([
      {
        value: 'lead',
        weight: 18
      },
      {
        value: 'qualified',
        weight: 24
      },
      {
        value: 'proposal',
        weight: 22
      },
      {
        value: 'negotiation',
        weight: 18
      },
      {
        value: 'won',
        weight: 10
      },
      {
        value: 'lost',
        weight: 8
      }
    ])
    const owner = random.weighted<string>(ownerOptions.map((option, index) => ({
      value: option.id,
      weight: index < 5 ? 4 : 2
    })))
    const segment = random.weighted<string>([
      {
        value: 'enterprise',
        weight: 18
      },
      {
        value: 'mid_market',
        weight: 36
      },
      {
        value: 'smb',
        weight: 46
      }
    ])
    const region = random.weighted<string>([
      {
        value: 'north_america',
        weight: 42
      },
      {
        value: 'emea',
        weight: 34
      },
      {
        value: 'apac',
        weight: 24
      }
    ])
    const values: Record<string, unknown> = {
      stage,
      company,
      owner,
      region,
      segment
    }

    putValue(values, 'tags', pickTags(random))
    if (random.chance(0.93)) {
      const magnitude = random.weighted<number>([
        {
          value: random.int(12000, 40000),
          weight: 30
        },
        {
          value: random.int(40000, 120000),
          weight: 42
        },
        {
          value: random.int(120000, 420000),
          weight: 22
        },
        {
          value: random.int(420000, 1800000),
          weight: 6
        }
      ])
      values.expectedRevenue = magnitude
    }
    if (random.chance(0.88)) {
      values.healthScore = random.int(52, 96)
    }
    if (random.chance(0.84)) {
      const closeOffset = stage === 'won' || stage === 'lost'
        ? random.int(-150, -3)
        : random.int(7, 120)
      values.closeDate = createDateValue(closeOffset)
    }
    if (random.chance(0.64)) {
      const ownerName = ownerOptions.find(option => option.id === owner)?.name ?? 'the account team'
      values.nextStep = buildSalesSummary(company, ownerName)
    }

    records.push({
      id: buildRecordId(index),
      title: buildSalesTitle(random, company),
      type: 'deal',
      values
    })
  }

  const tableView = createView({
    id: 'view_sales_table',
    type: 'table',
    name: 'Pipeline Table',
    schemaFields: fields,
    fields: [
      TITLE_FIELD_ID,
      'stage',
      'company',
      'owner',
      'region',
      'segment',
      'expectedRevenue',
      'healthScore',
      'closeDate',
      'tags'
    ],
    sort: [{
      fieldId: 'expectedRevenue',
      direction: 'desc'
    }],
    calc: {
      stage: 'countByOption',
      segment: 'countByOption',
      expectedRevenue: 'sum'
    }
  })
  const boardView = createView({
    id: 'view_sales_board',
    type: 'kanban',
    name: 'Revenue Board',
    schemaFields: fields,
    fields: [
      'company',
      'owner',
      'expectedRevenue',
      'closeDate'
    ],
    group: {
      fieldId: 'stage',
      mode: 'option',
      bucketSort: 'manual',
      showEmpty: true
    }
  })
  const galleryView = createView({
    id: 'view_sales_gallery',
    type: 'gallery',
    name: 'Account Focus',
    schemaFields: fields,
    fields: [
      'stage',
      'company',
      'expectedRevenue',
      'healthScore',
      'nextStep'
    ],
    options: {
      gallery: {
        card: {
          wrap: false,
          size: 'lg',
          layout: 'stacked'
        }
      }
    }
  })

  return document.normalize({
    activeViewId: boardView.id,
    fields: createEntityTable(fields),
    views: createEntityTable([boardView, tableView, galleryView]),
    records: createEntityTable(records),
    meta: {
      [PERF_PRESET_META_KEY]: {
        id: 'sales-20k',
        label: '销售管道 20k',
        groupLabel: '销售管道',
        recordCount,
        seed,
        summary: '商业感更强的高金额管道场景，适合演示 kanban、金额排序和 summary。',
        generatedAt: new Date().toISOString()
      } satisfies PerfPresetMeta
    }
  })
}

const createContentDocument = (recordCount: number, seed: number): DataDoc => {
  const random = createSeededRandom(seed)
  const ownerOptions = OWNER_POOL.map((name, index) => ({
    id: `content_owner_${index + 1}`,
    name,
    color: index % 2 === 0 ? 'pink' : 'blue'
  }))
  const fields: CustomField[] = [
    createStatusField('status', 'Status', CONTENT_STATUS_OPTIONS),
    createSelectField('channel', 'Channel', CHANNEL_OPTIONS),
    createSelectField('campaign', 'Campaign', CONTENT_CAMPAIGN_OPTIONS),
    createSelectField('contentType', 'Format', CONTENT_TYPE_OPTIONS),
    createSelectField('owner', 'Owner', ownerOptions),
    createMultiSelectField('tags', 'Tags', TAG_OPTIONS),
    createDateField('publishDate', 'Publish Date'),
    createNumberField('engagementScore', 'Engagement Score', {
      format: 'number',
      precision: 0
    }),
    createTextField('summary', 'Summary')
  ]

  const records: DataRecord[] = []

  for (let index = 0; index < recordCount; index += 1) {
    const status = random.weighted<string>([
      {
        value: 'idea',
        weight: 20
      },
      {
        value: 'scheduled',
        weight: 24
      },
      {
        value: 'in_production',
        weight: 26
      },
      {
        value: 'review',
        weight: 12
      },
      {
        value: 'live',
        weight: 18
      }
    ])
    const channel = random.weighted<string>(CHANNEL_OPTIONS.map(option => ({
      value: option.id,
      weight: option.id === 'email' || option.id === 'blog' ? 4 : 2
    })))
    const campaign = random.weighted<string>(CONTENT_CAMPAIGN_OPTIONS.map((option, index) => ({
      value: option.id,
      weight: index < 2 ? 4 : 2
    })))
    const contentType = random.weighted<string>(CONTENT_TYPE_OPTIONS.map((option, index) => ({
      value: option.id,
      weight: index === 0 || index === 1 ? 4 : 2
    })))
    const owner = random.pick(ownerOptions).id
    const values: Record<string, unknown> = {
      status,
      channel,
      campaign,
      contentType,
      owner
    }

    putValue(values, 'tags', pickTags(random))
    if (random.chance(0.9)) {
      const offset = status === 'live'
        ? random.int(-75, -2)
        : random.int(-10, 45)
      values.publishDate = createDateValue(offset)
    }
    if (random.chance(0.82)) {
      values.engagementScore = random.int(48, 96)
    }
    if (random.chance(0.66)) {
      const campaignName = CONTENT_CAMPAIGN_OPTIONS.find(option => option.id === campaign)?.name ?? 'Campaign'
      const ownerName = ownerOptions.find(option => option.id === owner)?.name ?? 'Owner'
      values.summary = buildContentSummary(campaignName, ownerName)
    }

    const campaignName = CONTENT_CAMPAIGN_OPTIONS.find(option => option.id === campaign)?.name ?? 'Campaign'
    const channelName = CHANNEL_OPTIONS.find(option => option.id === channel)?.name ?? 'Channel'

    records.push({
      id: buildRecordId(index),
      title: buildContentTitle(random, campaignName, channelName),
      type: 'content',
      values
    })
  }

  const galleryView = createView({
    id: 'view_content_gallery',
    type: 'gallery',
    name: 'Editorial Gallery',
    schemaFields: fields,
    fields: [
      'status',
      'channel',
      'campaign',
      'publishDate',
      'summary'
    ],
    sort: [{
      fieldId: 'publishDate',
      direction: 'asc'
    }],
    calc: {
      channel: 'countByOption',
      engagementScore: 'average'
    },
    options: {
      gallery: {
        card: {
          wrap: false,
          size: 'lg',
          layout: 'stacked'
        }
      }
    }
  })
  const tableView = createView({
    id: 'view_content_table',
    type: 'table',
    name: 'Publishing Table',
    schemaFields: fields,
    fields: [
      TITLE_FIELD_ID,
      'status',
      'channel',
      'campaign',
      'contentType',
      'owner',
      'publishDate',
      'engagementScore',
      'tags'
    ],
    sort: [{
      fieldId: 'publishDate',
      direction: 'asc'
    }],
    calc: {
      status: 'countByOption',
      channel: 'countByOption',
      engagementScore: 'average'
    }
  })
  const boardView = createView({
    id: 'view_content_board',
    type: 'kanban',
    name: 'Production Board',
    schemaFields: fields,
    fields: [
      'channel',
      'campaign',
      'publishDate',
      'tags'
    ],
    group: {
      fieldId: 'status',
      mode: 'option',
      bucketSort: 'manual',
      showEmpty: true
    }
  })

  return document.normalize({
    activeViewId: galleryView.id,
    fields: createEntityTable(fields),
    views: createEntityTable([galleryView, tableView, boardView]),
    records: createEntityTable(records),
    meta: {
      [PERF_PRESET_META_KEY]: {
        id: 'content-10k',
        label: '内容日历 10k',
        groupLabel: '内容运营日历',
        recordCount,
        seed,
        summary: '更偏展示型的内容运营场景，适合演示 gallery、日期排序和多标签内容分布。',
        generatedAt: new Date().toISOString()
      } satisfies PerfPresetMeta
    }
  })
}

const createEngineeringDocument = (recordCount: number, seed: number): DataDoc => {
  const random = createSeededRandom(seed)
  const assigneeOptions = OWNER_POOL.map((name, index) => ({
    id: `eng_owner_${index + 1}`,
    name,
    color: index % 2 === 0 ? 'blue' : 'green'
  }))
  const fields: CustomField[] = [
    createStatusField('status', 'Status', ENGINEERING_STATUS_OPTIONS),
    createSelectField('priority', 'Priority', PRIORITY_OPTIONS),
    createSelectField('assignee', 'Assignee', assigneeOptions),
    createSelectField('component', 'Component', ENGINEERING_COMPONENT_OPTIONS),
    createSelectField('severity', 'Severity', SEVERITY_OPTIONS),
    createSelectField('sprint', 'Sprint', SPRINT_OPTIONS),
    createMultiSelectField('labels', 'Labels', TAG_OPTIONS),
    createNumberField('estimate', 'Estimate', {
      format: 'integer',
      precision: 0
    }),
    createDateField('createdAt', 'Created At'),
    createDateField('updatedAt', 'Updated At'),
    createTextField('notes', 'Notes')
  ]

  const records: DataRecord[] = []

  for (let index = 0; index < recordCount; index += 1) {
    const component = random.weighted<string>(ENGINEERING_COMPONENT_OPTIONS.map((option, itemIndex) => ({
      value: option.id,
      weight: itemIndex < 3 ? 4 : 2
    })))
    const sprint = random.weighted<string>([
      {
        value: 'sprint_17',
        weight: 18
      },
      {
        value: 'sprint_18',
        weight: 30
      },
      {
        value: 'sprint_19',
        weight: 28
      },
      {
        value: 'backlog',
        weight: 24
      }
    ])
    const status = random.weighted<string>([
      {
        value: 'todo',
        weight: 32
      },
      {
        value: 'in_progress',
        weight: 24
      },
      {
        value: 'blocked',
        weight: 8
      },
      {
        value: 'review',
        weight: 12
      },
      {
        value: 'done',
        weight: 24
      }
    ])
    const assignee = random.weighted<string>(assigneeOptions.map((option, itemIndex) => ({
      value: option.id,
      weight: itemIndex < 6 ? 4 : 2
    })))
    const values: Record<string, unknown> = {
      status,
      priority: random.weighted<string>([
        {
          value: 'urgent',
          weight: 6
        },
        {
          value: 'high',
          weight: 22
        },
        {
          value: 'medium',
          weight: 50
        },
        {
          value: 'low',
          weight: 22
        }
      ]),
      assignee,
      component,
      severity: random.weighted<string>([
        {
          value: 'sev_1',
          weight: 3
        },
        {
          value: 'sev_2',
          weight: 14
        },
        {
          value: 'sev_3',
          weight: 38
        },
        {
          value: 'sev_4',
          weight: 45
        }
      ]),
      sprint
    }

    putValue(values, 'labels', pickTags(random))
    if (random.chance(0.85)) {
      values.estimate = random.weighted<number>([
        {
          value: 1,
          weight: 14
        },
        {
          value: 2,
          weight: 18
        },
        {
          value: 3,
          weight: 24
        },
        {
          value: 5,
          weight: 20
        },
        {
          value: 8,
          weight: 14
        },
        {
          value: 13,
          weight: 8
        },
        {
          value: 21,
          weight: 2
        }
      ])
    }
    const createdOffset = random.int(-220, -10)
    values.createdAt = createDateValue(createdOffset)
    if (random.chance(0.96)) {
      values.updatedAt = createDateValue(createdOffset + random.int(0, 120))
    }
    if (random.chance(0.58)) {
      const componentName = ENGINEERING_COMPONENT_OPTIONS.find(option => option.id === component)?.name ?? 'Component'
      const sprintName = SPRINT_OPTIONS.find(option => option.id === sprint)?.name ?? 'Backlog'
      values.notes = buildEngineeringSummary(componentName, sprintName)
    }

    const componentName = ENGINEERING_COMPONENT_OPTIONS.find(option => option.id === component)?.name ?? 'Component'

    records.push({
      id: buildRecordId(index),
      title: buildEngineeringTitle(random, componentName),
      type: 'task',
      values
    })
  }

  const tableView = createView({
    id: 'view_engineering_table',
    type: 'table',
    name: 'Engineering Table',
    schemaFields: fields,
    fields: [
      TITLE_FIELD_ID,
      'status',
      'priority',
      'severity',
      'assignee',
      'component',
      'sprint',
      'estimate',
      'updatedAt',
      'labels'
    ],
    sort: [{
      fieldId: 'updatedAt',
      direction: 'desc'
    }],
    group: {
      fieldId: 'status',
      mode: 'option',
      bucketSort: 'manual',
      showEmpty: true
    },
    calc: {
      status: 'countByOption',
      priority: 'countByOption',
      labels: 'countByOption',
      estimate: 'sum'
    }
  })
  const boardView = createView({
    id: 'view_engineering_board',
    type: 'kanban',
    name: 'Delivery Board',
    schemaFields: fields,
    fields: [
      'priority',
      'assignee',
      'estimate',
      'labels'
    ],
    group: {
      fieldId: 'status',
      mode: 'option',
      bucketSort: 'manual',
      showEmpty: true
    }
  })
  const galleryView = createView({
    id: 'view_engineering_gallery',
    type: 'gallery',
    name: 'Focus List',
    schemaFields: fields,
    fields: [
      'status',
      'component',
      'priority',
      'updatedAt',
      'notes'
    ],
    sort: [{
      fieldId: 'updatedAt',
      direction: 'desc'
    }]
  })

  return document.normalize({
    activeViewId: tableView.id,
    fields: createEntityTable(fields),
    views: createEntityTable([tableView, boardView, galleryView]),
    records: createEntityTable(records),
    meta: {
      [PERF_PRESET_META_KEY]: {
        id: 'engineering-50k',
        label: '工程任务库 50k',
        groupLabel: '工程任务库',
        recordCount,
        seed,
        summary: '更接近真实研发团队的任务库，适合压测大规模滚动、group、search 和 summary。',
        generatedAt: new Date().toISOString()
      } satisfies PerfPresetMeta
    }
  })
}

const createDenseAnalyticsDocument = (recordCount: number, seed: number): DataDoc => {
  const random = createSeededRandom(seed)
  const ownerOptions = OWNER_POOL.map((name, index) => ({
    id: `analyst_${index + 1}`,
    name,
    color: index % 2 === 0 ? 'blue' : 'green'
  }))
  const fields: CustomField[] = [
    createStatusField('status', 'Status', ENGINEERING_STATUS_OPTIONS),
    createSelectField('segment', 'Segment', DENSE_SEGMENT_OPTIONS),
    createSelectField('region', 'Region', DENSE_REGION_OPTIONS),
    createSelectField('channel', 'Channel', CHANNEL_OPTIONS),
    createSelectField('source', 'Source', DENSE_SOURCE_OPTIONS),
    createSelectField('owner', 'Owner', ownerOptions),
    createMultiSelectField('tags', 'Tags', TAG_OPTIONS),
    createNumberField('score', 'Score', {
      precision: 0
    }),
    createNumberField('velocity', 'Velocity', {
      precision: 1
    }),
    createNumberField('forecast', 'Forecast', {
      format: 'currency',
      currency: 'USD'
    }),
    createNumberField('variance', 'Variance', {
      precision: 1
    }),
    createNumberField('pipeline', 'Pipeline', {
      format: 'currency',
      currency: 'USD'
    }),
    createDateField('createdAt', 'Created At'),
    createDateField('reviewDate', 'Review Date'),
    createDateField('dueDate', 'Due Date'),
    createTextField('notes', 'Notes')
  ]

  const records: DataRecord[] = []

  for (let index = 0; index < recordCount; index += 1) {
    const segment = random.weighted<string>(DENSE_SEGMENT_OPTIONS.map((option, itemIndex) => ({
      value: option.id,
      weight: itemIndex < 2 ? 4 : 2
    })))
    const region = random.weighted<string>(DENSE_REGION_OPTIONS.map((option, itemIndex) => ({
      value: option.id,
      weight: itemIndex === 0 ? 4 : 2
    })))
    const channel = random.weighted<string>(CHANNEL_OPTIONS.map((option, itemIndex) => ({
      value: option.id,
      weight: itemIndex < 2 ? 4 : 2
    })))
    const source = random.weighted<string>(DENSE_SOURCE_OPTIONS.map((option, itemIndex) => ({
      value: option.id,
      weight: itemIndex < 2 ? 4 : 2
    })))
    const values: Record<string, unknown> = {
      status: random.weighted<string>([
        {
          value: 'todo',
          weight: 18
        },
        {
          value: 'in_progress',
          weight: 34
        },
        {
          value: 'blocked',
          weight: 6
        },
        {
          value: 'review',
          weight: 14
        },
        {
          value: 'done',
          weight: 28
        }
      ]),
      segment,
      region,
      channel,
      source,
      owner: random.pick(ownerOptions).id
    }

    putValue(values, 'tags', pickTags(random))
    if (random.chance(0.92)) {
      values.score = random.int(52, 98)
    }
    if (random.chance(0.9)) {
      values.velocity = random.int(18, 145) / 10
    }
    if (random.chance(0.87)) {
      values.forecast = random.weighted<number>([
        {
          value: random.int(20000, 120000),
          weight: 36
        },
        {
          value: random.int(120000, 480000),
          weight: 42
        },
        {
          value: random.int(480000, 1600000),
          weight: 18
        },
        {
          value: random.int(1600000, 4200000),
          weight: 4
        }
      ])
    }
    if (random.chance(0.84)) {
      values.variance = (random.int(-320, 320)) / 10
    }
    if (random.chance(0.9)) {
      values.pipeline = random.weighted<number>([
        {
          value: random.int(40000, 220000),
          weight: 38
        },
        {
          value: random.int(220000, 900000),
          weight: 40
        },
        {
          value: random.int(900000, 2800000),
          weight: 18
        },
        {
          value: random.int(2800000, 5200000),
          weight: 4
        }
      ])
    }

    const createdOffset = random.int(-260, -5)
    values.createdAt = createDateValue(createdOffset)
    if (random.chance(0.88)) {
      values.reviewDate = createDateValue(createdOffset + random.int(5, 45))
    }
    if (random.chance(0.8)) {
      values.dueDate = createDateValue(random.int(7, 90))
    }
    if (random.chance(0.54)) {
      const segmentName = DENSE_SEGMENT_OPTIONS.find(option => option.id === segment)?.name ?? 'Segment'
      const channelName = CHANNEL_OPTIONS.find(option => option.id === channel)?.name ?? 'Channel'
      values.notes = buildDenseSummary(segmentName, channelName)
    }

    const segmentName = DENSE_SEGMENT_OPTIONS.find(option => option.id === segment)?.name ?? 'Segment'
    const regionName = DENSE_REGION_OPTIONS.find(option => option.id === region)?.name ?? 'Region'

    records.push({
      id: buildRecordId(index),
      title: buildDenseTitle(random, segmentName, regionName),
      type: 'analysis',
      values
    })
  }

  const tableView = createView({
    id: 'view_dense_table',
    type: 'table',
    name: 'Analytics Table',
    schemaFields: fields,
    fields: [
      TITLE_FIELD_ID,
      'status',
      'segment',
      'region',
      'channel',
      'source',
      'score',
      'velocity',
      'variance',
      'forecast',
      'pipeline',
      'reviewDate'
    ],
    sort: [{
      fieldId: 'forecast',
      direction: 'desc'
    }],
    group: {
      fieldId: 'segment',
      mode: 'option',
      bucketSort: 'manual',
      showEmpty: true
    },
    calc: {
      segment: 'countByOption',
      region: 'countByOption',
      channel: 'countByOption',
      tags: 'countByOption',
      score: 'average',
      forecast: 'sum',
      pipeline: 'sum'
    }
  })
  const boardView = createView({
    id: 'view_dense_board',
    type: 'kanban',
    name: 'Operating Board',
    schemaFields: fields,
    fields: [
      'region',
      'channel',
      'forecast',
      'score'
    ],
    group: {
      fieldId: 'status',
      mode: 'option',
      bucketSort: 'manual',
      showEmpty: true
    }
  })
  const galleryView = createView({
    id: 'view_dense_gallery',
    type: 'gallery',
    name: 'Metric Cards',
    schemaFields: fields,
    fields: [
      'segment',
      'forecast',
      'variance',
      'notes'
    ]
  })

  return document.normalize({
    activeViewId: tableView.id,
    fields: createEntityTable(fields),
    views: createEntityTable([tableView, boardView, galleryView]),
    records: createEntityTable(records),
    meta: {
      [PERF_PRESET_META_KEY]: {
        id: 'dense-20k',
        label: 'Dense Analytics 20k',
        groupLabel: '压测专用',
        recordCount,
        seed,
        summary: '偏宽表和聚合的高密度场景，适合压测 summary、group、排序和横向滚动。',
        generatedAt: new Date().toISOString()
      } satisfies PerfPresetMeta
    }
  })
}

export const PERF_PRESETS: readonly PerfPresetDefinition[] = [
  {
    id: 'roadmap-1k',
    label: '产品路线图 1k',
    menuLabel: '加载 1k',
    groupKey: 'roadmap',
    groupLabel: '产品路线图',
    recordCount: 1000,
    seed: 31001,
    summary: '轻量但观感完整的产品路线图场景，适合演示切换和基础性能测试。',
    createDocument: () => createRoadmapDocument(1000, 31001)
  },
  {
    id: 'roadmap-10k',
    label: '产品路线图 10k',
    menuLabel: '加载 10k',
    groupKey: 'roadmap',
    groupLabel: '产品路线图',
    recordCount: 10000,
    seed: 31010,
    summary: '更适合压测的路线图场景，兼顾吸引力、真实感和多视图演示。',
    createDocument: () => createRoadmapDocument(10000, 31010)
  },
  {
    id: 'sales-20k',
    label: '销售管道 20k',
    menuLabel: '加载 20k',
    groupKey: 'sales',
    groupLabel: '销售管道',
    recordCount: 20000,
    seed: 42020,
    summary: '商业感更强的 pipeline 场景，适合演示金额排序、阶段分组和高价值数据观感。',
    createDocument: () => createSalesDocument(20000, 42020)
  },
  {
    id: 'content-10k',
    label: '内容日历 10k',
    menuLabel: '加载 10k',
    groupKey: 'content',
    groupLabel: '内容运营日历',
    recordCount: 10000,
    seed: 51010,
    summary: '偏展示型的内容运营场景，适合演示 gallery、日期字段和标签分布。',
    createDocument: () => createContentDocument(10000, 51010)
  },
  {
    id: 'engineering-50k',
    label: '工程任务库 50k',
    menuLabel: '加载 50k',
    groupKey: 'engineering',
    groupLabel: '工程任务库',
    recordCount: 50000,
    seed: 65050,
    summary: '更贴近真实研发团队的任务库，适合大规模滚动、搜索、分组和 summary 压测。',
    createDocument: () => createEngineeringDocument(50000, 65050)
  },
  {
    id: 'dense-20k',
    label: 'Dense Analytics 20k',
    menuLabel: '加载 20k',
    groupKey: 'dense',
    groupLabel: '压测专用',
    recordCount: 20000,
    seed: 72020,
    summary: '高密度宽表场景，优先压测 summary、聚合、排序与横向滚动。',
    createDocument: () => createDenseAnalyticsDocument(20000, 72020)
  }
] as const

const PERF_PRESET_MAP = new Map<PerfPresetId, PerfPresetDefinition>(
  PERF_PRESETS.map(preset => [preset.id, preset])
)

const hasPerfPresetMeta = (
  value: unknown
): value is PerfPresetMeta => (
  typeof value === 'object'
  && value !== null
  && 'id' in value
  && 'label' in value
  && 'groupLabel' in value
  && 'recordCount' in value
  && 'seed' in value
  && 'summary' in value
  && 'generatedAt' in value
)

export const readPerfPresetMeta = (
  meta: Record<string, unknown> | undefined
): PerfPresetMeta | undefined => {
  const source = meta?.[PERF_PRESET_META_KEY]
  return hasPerfPresetMeta(source)
    ? source
    : undefined
}

export const buildPerfPresetMenuItems = (input: {
  currentPresetId?: PerfPresetId
  busyPresetId?: PerfPresetId | null
  onSelect: (presetId: PerfPresetId) => void
}): readonly MenuItem[] => {
  const groups = PERF_PRESETS.reduce((map, preset) => {
    const current = map.get(preset.groupKey) ?? {
      label: preset.groupLabel,
      presets: [] as PerfPresetDefinition[]
    }
    current.presets.push(preset)
    map.set(preset.groupKey, current)
    return map
  }, new Map<string, {
    label: string
    presets: PerfPresetDefinition[]
  }>())

  const items: MenuItem[] = []

  Array.from(groups.entries()).forEach(([groupKey, group], groupIndex) => {
    if (groupIndex > 0) {
      items.push({
        kind: 'divider',
        key: `perf-divider:${groupKey}`
      })
    }

    items.push({
      kind: 'label',
      key: `perf-label:${groupKey}`,
      label: group.label
    })

    group.presets.forEach(preset => {
      const busy = input.busyPresetId === preset.id
      const selected = input.currentPresetId === preset.id

      items.push({
        kind: 'action',
        key: `perf-preset:${preset.id}`,
        label: preset.menuLabel,
        suffix: busy
          ? '生成中'
          : selected
            ? '当前'
            : undefined,
        disabled: Boolean(input.busyPresetId),
        onSelect: () => {
          input.onSelect(preset.id)
        }
      })
    })
  })

  return items
}

export const applyPerfPreset = (input: {
  engine: Engine
  presetId: PerfPresetId
}) => {
  const preset = PERF_PRESET_MAP.get(input.presetId)
  if (!preset) {
    throw new Error(`Unknown performance preset: ${input.presetId}`)
  }

  const document = preset.createDocument()
  input.engine.replace(document, {
    origin: 'system'
  })

  return {
    preset,
    document
  }
}
