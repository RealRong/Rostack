import type {
  Field,
  GalleryView,
  KanbanView,
  TableOptions,
  FieldId,
  ViewOptionsByType,
  ViewType
} from '@dataview/core/types'
import {
  spec
} from '@shared/spec'
import {
  replaceViewFields
} from '@dataview/core/view/fields'

export interface ViewTypeSpecEntry<
  TType extends ViewType = ViewType
> {
  capabilities: {
    create: true
    group: boolean
  }
  defaults: {
    fields(fields: readonly Field[]): FieldId[]
    options(fields: readonly Field[]): ViewOptionsByType[TType]
  }
}

export const viewTypeSpec = {
  table: {
    capabilities: {
      create: true,
      group: true
    },
    defaults: {
      fields: (fields: readonly Field[]): FieldId[] => replaceViewFields(
        fields.map(field => field.id)
      ),
      options: (_fields: readonly Field[]): TableOptions => ({
        widths: {},
        showVerticalLines: true,
        wrap: false
      })
    }
  },
  gallery: {
    capabilities: {
      create: true,
      group: false
    },
    defaults: {
      fields: (): FieldId[] => replaceViewFields([]),
      options: (_fields: readonly Field[]): GalleryView['options'] => ({
        card: {
          wrap: false,
          size: 'md',
          layout: 'stacked'
        }
      })
    }
  },
  kanban: {
    capabilities: {
      create: true,
      group: true
    },
    defaults: {
      fields: (): FieldId[] => replaceViewFields([]),
      options: (_fields: readonly Field[]): KanbanView['options'] => ({
        card: {
          wrap: false,
          size: 'md',
          layout: 'compact'
        },
        fillColumnColor: true,
        cardsPerColumn: 25
      })
    }
  }
} as const satisfies Record<ViewType, ViewTypeSpecEntry>

const viewTypeIndex = spec.table(viewTypeSpec)

export const getViewTypeSpec = <
  TType extends ViewType
>(
  type: TType
): typeof viewTypeSpec[TType] => viewTypeIndex.get(type)
