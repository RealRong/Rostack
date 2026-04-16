import {
  KanbanSquare,
  LayoutGrid,
  Table2,
  type LucideIcon
} from 'lucide-react'
import type { ViewType } from '@dataview/core/contracts'
import { defineMetaCollection } from '@dataview/meta/shared'
import {
  token,
  type Token
} from '@shared/i18n'

export interface ViewDescriptor {
  id: string
  token: Token
  Icon: LucideIcon
}

const VIEW_ITEMS = [
  {
    id: 'table',
    token: token('meta.view.table', 'Table'),
    Icon: Table2
  },
  {
    id: 'gallery',
    token: token('meta.view.gallery', 'Gallery'),
    Icon: LayoutGrid
  },
  {
    id: 'kanban',
    token: token('meta.view.kanban', 'Kanban'),
    Icon: KanbanSquare
  }
] as const satisfies readonly ViewDescriptor[]

export const view = defineMetaCollection(VIEW_ITEMS, {
  defaultId: 'table',
  fallback: (id?: string) => ({
    id: id ?? 'unknown',
    token: token('meta.view.unknown', id ?? 'Unknown'),
    Icon: LayoutGrid
  })
})

export type ViewId = ViewType
