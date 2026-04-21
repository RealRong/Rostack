import type {
  Field,
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  FieldList
} from '@dataview/engine/contracts'
import {
  sameFieldList
} from '@dataview/engine/active/snapshot/equality'
import {
  reuseIfEqual
} from '@dataview/engine/active/snapshot/reuse'
import type {
  DocumentReader
} from '@dataview/engine/document/reader'
import {
  createFieldsProjection
} from '@dataview/engine/active/snapshot/base/fields'
import {
  createQueryProjection,
  sameQueryProjection
} from '@dataview/engine/active/snapshot/base/query'
import {
  createGalleryProjection,
  createKanbanProjection,
  createTableProjection,
  sameGalleryProjection,
  sameKanbanProjection,
  sameTableProjection
} from '@dataview/engine/active/snapshot/base/viewModes'

export const publishViewBase = (input: {
  reader: DocumentReader
  fieldsById: ReadonlyMap<FieldId, Field>
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
    byId: input.fieldsById
  })
  const nextQuery = createQueryProjection({
    view,
    fieldsById: input.fieldsById
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
