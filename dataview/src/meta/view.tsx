import {
  KanbanSquare,
  LayoutGrid,
  Table2,
  type LucideIcon
} from 'lucide-react'
import type { GroupViewType } from '@/core/contracts'
import { message } from './message'
import { defineMetaCollection } from './shared'

export interface ViewDescriptor {
  id: string
  message: ReturnType<typeof message>
  Icon: LucideIcon
}

const VIEW_ITEMS = [
  {
    id: 'table',
    message: message('meta.view.table', 'Table'),
    Icon: Table2
  },
  {
    id: 'gallery',
    message: message('meta.view.gallery', 'Gallery'),
    Icon: LayoutGrid
  },
  {
    id: 'kanban',
    message: message('meta.view.kanban', 'Kanban'),
    Icon: KanbanSquare
  }
] as const satisfies readonly ViewDescriptor[]

export const view = defineMetaCollection(VIEW_ITEMS, {
  defaultId: 'table',
  fallback: (id?: string) => ({
    id: id ?? 'unknown',
    message: message('meta.view.unknown', id ?? 'Unknown'),
    Icon: LayoutGrid
  })
})

export type ViewId = GroupViewType
