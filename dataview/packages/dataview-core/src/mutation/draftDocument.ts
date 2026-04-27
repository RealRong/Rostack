import {
  draft,
  type DraftEntityTable,
  type DraftRoot
} from '@shared/draft'
import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  RecordId,
  View,
  ViewId
} from '@dataview/core/types/state'

interface ScalarBranch<T> {
  readonly base: T
  current(): T
  set(value: T): void
  changed(): boolean
  finish(): T
}

const createScalarBranch = <T>(
  base: T
): ScalarBranch<T> => {
  let current = base
  let changed = false

  return {
    base,
    current: () => current,
    set: (value) => {
      if (changed && Object.is(current, value)) {
        return
      }
      if (!changed && Object.is(base, value)) {
        return
      }

      current = value
      changed = !Object.is(base, value)
    },
    changed: () => changed,
    finish: () => (
      changed
        ? current
        : base
    )
  }
}

export interface DataviewDraftDocument {
  readonly root: DraftRoot<DataDoc>
  readonly fields: DraftEntityTable<CustomFieldId, CustomField>
  readonly records: DraftEntityTable<RecordId, DataRecord>
  readonly views: DraftEntityTable<ViewId, View>
  readonly activeViewId: ScalarBranch<ViewId | undefined>

  current(): DataDoc
  changed(): boolean
  finish(): DataDoc
}

export const createDataviewDraftDocument = (
  document: DataDoc
): DataviewDraftDocument => {
  const rootDraft = draft.root(document)
  const fields = draft.entityTable(document.fields)
  const records = draft.entityTable(document.records)
  const views = draft.entityTable(document.views)
  const activeViewId = createScalarBranch(document.activeViewId)

  const changed = () => (
    rootDraft.changed()
    || fields.changed()
    || records.changed()
    || views.changed()
    || activeViewId.changed()
  )

  const current = (): DataDoc => {
    if (!changed()) {
      return rootDraft.current()
    }

    const base = rootDraft.current()
    return {
      ...base,
      ...(fields.changed()
        ? {
            fields: fields.finish()
          }
        : {}),
      ...(records.changed()
        ? {
            records: records.finish()
          }
        : {}),
      ...(views.changed()
        ? {
            views: views.finish()
          }
        : {}),
      ...(activeViewId.changed()
        ? {
            activeViewId: activeViewId.finish()
          }
        : {})
    }
  }

  const finish = (): DataDoc => {
    if (!changed()) {
      return rootDraft.finish()
    }

    const next = rootDraft.write()
    if (fields.changed()) {
      next.fields = fields.finish()
    }
    if (records.changed()) {
      next.records = records.finish()
    }
    if (views.changed()) {
      next.views = views.finish()
    }
    if (activeViewId.changed()) {
      next.activeViewId = activeViewId.finish()
    }

    return rootDraft.finish()
  }

  return {
    root: rootDraft,
    fields,
    records,
    views,
    activeViewId,
    current,
    changed,
    finish
  }
}
