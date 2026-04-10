import type {
  ViewGroupProjection
} from '@dataview/core/group'
import {
  getFieldGroupMeta
} from '@dataview/core/field'
import type {
  GroupView
} from '../../types'
import type {
  Stage
} from '../runtime/stage'
import {
  reuse,
  shouldRun
} from '../runtime/stage'

const createInactiveGroupProjection = (
  viewId: string
): ViewGroupProjection => ({
  viewId,
  active: false,
  fieldId: '',
  field: undefined,
  fieldLabel: '',
  mode: '',
  bucketSort: undefined,
  bucketInterval: undefined,
  showEmpty: true,
  availableModes: [],
  availableBucketSorts: [],
  supportsInterval: false
})

const createGroupProjection = (input: {
  viewId: string
  group: NonNullable<ViewGroupProjection['group']>
  fieldsById: ReadonlyMap<string, ViewGroupProjection['field']>
}): ViewGroupProjection => {
  const field = input.fieldsById.get(input.group.field)

  if (!field) {
    return {
      viewId: input.viewId,
      group: input.group,
      active: true,
      fieldId: input.group.field,
      field: undefined,
      fieldLabel: 'Deleted field',
      mode: input.group.mode,
      bucketSort: input.group.bucketSort,
      bucketInterval: input.group.bucketInterval,
      showEmpty: input.group.showEmpty !== false,
      availableModes: [],
      availableBucketSorts: [],
      supportsInterval: false
    }
  }

  const meta = getFieldGroupMeta(field, {
    mode: input.group.mode,
    bucketSort: input.group.bucketSort,
    ...(input.group.bucketInterval !== undefined
      ? { bucketInterval: input.group.bucketInterval }
      : {})
  })

  return {
    viewId: input.viewId,
    group: input.group,
    active: true,
    fieldId: field.id,
    field,
    fieldLabel: field.name,
    mode: meta.mode,
    bucketSort: meta.sort || undefined,
    bucketInterval: meta.bucketInterval,
    showEmpty: meta.showEmpty !== false,
    availableModes: meta.modes,
    availableBucketSorts: meta.sorts,
    supportsInterval: meta.supportsInterval
  }
}

export const groupStage: Stage<GroupView> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    const view = input.next.read.view()
    if (!view || !input.next.activeViewId) {
      return undefined
    }

    return view.group
      ? createGroupProjection({
          viewId: input.next.activeViewId,
          group: view.group,
          fieldsById: input.next.read.fieldsById()
        })
      : createInactiveGroupProjection(input.next.activeViewId)
  }
}
