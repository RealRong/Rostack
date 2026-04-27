import {
  Calendar,
  Clock3,
  FileText,
  LayoutDashboard,
  List,
  Map,
  Newspaper,
  PieChart,
  type LucideIcon
} from 'lucide-react'
import type { ViewType } from '@dataview/core/types'
import { viewTypeSpec } from '@dataview/core/view'
import { meta, type Token } from '@dataview/meta'
import {
  spec
} from '@shared/spec'
import { token } from '@shared/i18n'

export interface CreateViewItem {
  id: string
  type: ViewType | string
  label: Token
  Icon: LucideIcon
  enabled: boolean
}

const COMING_SOON_ITEMS: readonly CreateViewItem[] = [
  {
    id: 'list',
    type: 'list',
    label: token('meta.view.list', 'List'),
    Icon: List,
    enabled: false
  },
  {
    id: 'chart',
    type: 'chart',
    label: token('meta.view.chart', 'Chart'),
    Icon: PieChart,
    enabled: false
  },
  {
    id: 'dashboard',
    type: 'dashboard',
    label: token('meta.view.dashboard', 'Dashboard'),
    Icon: LayoutDashboard,
    enabled: false
  },
  {
    id: 'timeline',
    type: 'timeline',
    label: token('meta.view.timeline', 'Timeline'),
    Icon: Clock3,
    enabled: false
  },
  {
    id: 'feed',
    type: 'feed',
    label: token('meta.view.feed', 'Feed'),
    Icon: Newspaper,
    enabled: false
  },
  {
    id: 'map',
    type: 'map',
    label: token('meta.view.map', 'Map'),
    Icon: Map,
    enabled: false
  },
  {
    id: 'calendar',
    type: 'calendar',
    label: token('meta.view.calendar', 'Calendar'),
    Icon: Calendar,
    enabled: false
  },
  {
    id: 'form',
    type: 'form',
    label: token('meta.view.form', 'Form'),
    Icon: FileText,
    enabled: false
  }
]

const viewTypeIndex = spec.table(viewTypeSpec)

export const CREATE_VIEW_ITEMS: readonly CreateViewItem[] = [
  ...viewTypeIndex.entries.map(([type, spec]) => ({
    id: type,
    type,
    label: meta.view.get(type).token,
    Icon: meta.view.get(type).Icon,
    enabled: spec.capabilities.create
  })),
  ...COMING_SOON_ITEMS
] as const
