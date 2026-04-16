import {
  Calendar,
  Clock3,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  LayoutGrid,
  List,
  Map,
  Newspaper,
  PieChart,
  Table2,
  type LucideIcon
} from 'lucide-react'
import type { ViewType } from '@dataview/core/contracts'
import { meta, type Token } from '@dataview/meta'
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

export const CREATE_VIEW_ITEMS: readonly CreateViewItem[] = [
  {
    id: 'table',
    type: 'table',
    label: meta.view.get('table').token,
    Icon: Table2,
    enabled: true
  },
  {
    id: 'kanban',
    type: 'kanban',
    label: meta.view.get('kanban').token,
    Icon: KanbanSquare,
    enabled: true
  },
  {
    id: 'gallery',
    type: 'gallery',
    label: meta.view.get('gallery').token,
    Icon: LayoutGrid,
    enabled: true
  },
  ...COMING_SOON_ITEMS
] as const
