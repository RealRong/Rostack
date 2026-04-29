import type {
  View,
  ViewId
} from '@dataview/core/types'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
} from '@dataview/engine/contracts/view'
import type {
  FieldList
} from '@dataview/engine/contracts/shared'
import {
  sameFieldList
} from '@dataview/engine/active/publish/equality'
import {
  reuseIfEqual
} from '@dataview/engine/active/publish/reuse'
import type {
  DocumentReader
} from '@dataview/core/document/reader'
import {
  createFieldsProjection
} from '@dataview/engine/active/publish/fields'
import {
  createQueryProjection,
  sameQueryProjection
} from '@dataview/engine/active/publish/query'
import {
  createGalleryProjection,
  createKanbanProjection,
  createTableProjection,
  sameGalleryProjection,
  sameKanbanProjection,
  sameTableProjection
} from '@dataview/engine/active/publish/viewModes'

export const publishViewBase = (input: {
  reader: DocumentReader
  viewId?: ViewId
  previous?: {
    view?: View
    query?: ActiveViewQuery
    fields?: FieldList
    table?: ActiveViewTable
    gallery?: ActiveViewGallery
    kanban?: ActiveViewKanban
  }
}): {
  view?: View
  query?: ActiveViewQuery
  fields?: FieldList
  table?: ActiveViewTable
  gallery?: ActiveViewGallery
  kanban?: ActiveViewKanban
} => {
  const view = input.viewId
    ? input.reader.views.get(input.viewId)
    : undefined
  if (!view || !input.viewId) {
    return {
      view: undefined,
      query: undefined,
      fields: undefined,
      table: undefined,
      gallery: undefined,
      kanban: undefined
    }
  }

  const nextFields = createFieldsProjection({
    fieldIds: view.display.fields,
    getField: input.reader.fields.get
  })
  const nextQuery = createQueryProjection({
    view,
    reader: input.reader
  })
  const nextTable = createTableProjection({
    view,
    fields: nextFields
  })
  const nextGallery = createGalleryProjection({
    view,
    query: nextQuery
  })
  const nextKanban = createKanbanProjection({
    view,
    query: nextQuery
  })

  return {
    view: input.previous?.view === view
      ? input.previous.view
      : view,
    query: reuseIfEqual(input.previous?.query, nextQuery, sameQueryProjection),
    fields: reuseIfEqual(input.previous?.fields, nextFields, sameFieldList),
    table: reuseIfEqual(input.previous?.table, nextTable, sameTableProjection),
    gallery: reuseIfEqual(input.previous?.gallery, nextGallery, sameGalleryProjection),
    kanban: reuseIfEqual(input.previous?.kanban, nextKanban, sameKanbanProjection)
  }
}
