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
import type { GroupViewType } from '@dataview/core/contracts'
import { message, meta, type MessageSpec } from '@dataview/meta'

export interface CreateViewItem {
  id: string
  type: GroupViewType | string
  label: MessageSpec
  Icon: LucideIcon
  enabled: boolean
}

const COMING_SOON_ITEMS: readonly CreateViewItem[] = [
  {
    id: 'list',
    type: 'list',
    label: message('meta.view.list', 'List'),
    Icon: List,
    enabled: false
  },
  {
    id: 'chart',
    type: 'chart',
    label: message('meta.view.chart', 'Chart'),
    Icon: PieChart,
    enabled: false
  },
  {
    id: 'dashboard',
    type: 'dashboard',
    label: message('meta.view.dashboard', 'Dashboard'),
    Icon: LayoutDashboard,
    enabled: false
  },
  {
    id: 'timeline',
    type: 'timeline',
    label: message('meta.view.timeline', 'Timeline'),
    Icon: Clock3,
    enabled: false
  },
  {
    id: 'feed',
    type: 'feed',
    label: message('meta.view.feed', 'Feed'),
    Icon: Newspaper,
    enabled: false
  },
  {
    id: 'map',
    type: 'map',
    label: message('meta.view.map', 'Map'),
    Icon: Map,
    enabled: false
  },
  {
    id: 'calendar',
    type: 'calendar',
    label: message('meta.view.calendar', 'Calendar'),
    Icon: Calendar,
    enabled: false
  },
  {
    id: 'form',
    type: 'form',
    label: message('meta.view.form', 'Form'),
    Icon: FileText,
    enabled: false
  }
]

export const CREATE_VIEW_ITEMS: readonly CreateViewItem[] = [
  {
    id: 'table',
    type: 'table',
    label: meta.view.get('table').message,
    Icon: Table2,
    enabled: true
  },
  {
    id: 'kanban',
    type: 'kanban',
    label: meta.view.get('kanban').message,
    Icon: KanbanSquare,
    enabled: true
  },
  {
    id: 'gallery',
    type: 'gallery',
    label: meta.view.get('gallery').message,
    Icon: LayoutGrid,
    enabled: true
  },
  ...COMING_SOON_ITEMS
] as const
