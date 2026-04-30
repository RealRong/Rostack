import { json } from '@shared/core'
import type {
  Path,
  RecordWrite
} from '@shared/draft'
import type {
  EdgeFieldPatch,
  EdgeLabelFieldPatch,
  EdgeLabelPatch,
  EdgeLabelUpdateInput,
  EdgePatch,
  EdgeUpdateInput
} from '@whiteboard/core/types'
import {
  applyScopedRecordWriteToPatch,
  splitScopedPatch
} from '@whiteboard/core/utils/scopedPatch'

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

const cloneEdgeFieldPatch = (
  fields?: EdgeFieldPatch
): EdgeFieldPatch => {
  const patch: EdgeFieldPatch = {}
  if (!fields) {
    return patch
  }

  if (hasOwn(fields, 'source')) {
    patch.source = json.clone(fields.source)
  }
  if (hasOwn(fields, 'target')) {
    patch.target = json.clone(fields.target)
  }
  if (hasOwn(fields, 'type')) {
    patch.type = json.clone(fields.type)
  }
  if (hasOwn(fields, 'locked')) {
    patch.locked = json.clone(fields.locked)
  }
  if (hasOwn(fields, 'groupId')) {
    patch.groupId = json.clone(fields.groupId)
  }
  if (hasOwn(fields, 'textMode')) {
    patch.textMode = json.clone(fields.textMode)
  }

  return patch
}

const cloneEdgeLabelFieldPatch = (
  fields?: EdgeLabelFieldPatch
): EdgeLabelFieldPatch => {
  const patch: EdgeLabelFieldPatch = {}
  if (!fields) {
    return patch
  }

  if (hasOwn(fields, 'text')) {
    patch.text = json.clone(fields.text)
  }
  if (hasOwn(fields, 't')) {
    patch.t = json.clone(fields.t)
  }
  if (hasOwn(fields, 'offset')) {
    patch.offset = json.clone(fields.offset)
  }

  return patch
}

export const createEdgeStyleRecordWrite = (
  path: Path,
  value: unknown
): RecordWrite => Object.freeze({
  [`style.${path}`]: value
})

export const createEdgeStyleRecordUpdate = (
  path: Path,
  value: unknown
): EdgeUpdateInput => ({
  record: createEdgeStyleRecordWrite(path, value)
})

export const createEdgePatch = (
  update: EdgeUpdateInput
): EdgePatch => applyScopedRecordWriteToPatch({
  ...(update.fields ? cloneEdgeFieldPatch(update.fields) : {})
}, update.record, ['route', 'style', 'labels', 'data'])

export const readEdgeUpdateFromPatch = (
  patch: EdgePatch
): EdgeUpdateInput => {
  const {
    record
  } = splitScopedPatch(patch, ['route', 'style', 'labels', 'data'])
  const fields: EdgeFieldPatch = {}

  if (hasOwn(patch, 'source')) {
    fields.source = json.clone(patch.source)
  }
  if (hasOwn(patch, 'target')) {
    fields.target = json.clone(patch.target)
  }
  if (hasOwn(patch, 'type')) {
    fields.type = json.clone(patch.type)
  }
  if (hasOwn(patch, 'locked')) {
    fields.locked = json.clone(patch.locked)
  }
  if (hasOwn(patch, 'groupId')) {
    fields.groupId = json.clone(patch.groupId)
  }
  if (hasOwn(patch, 'textMode')) {
    fields.textMode = json.clone(patch.textMode)
  }

  return {
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(record ? { record } : {})
  }
}

export const createEdgeLabelPatch = (
  update: EdgeLabelUpdateInput
): EdgeLabelPatch => applyScopedRecordWriteToPatch({
  ...(update.fields ? cloneEdgeLabelFieldPatch(update.fields) : {})
}, update.record, ['data', 'style'])

export const readEdgeLabelUpdateFromPatch = (
  patch: EdgeLabelPatch
): EdgeLabelUpdateInput => {
  const {
    record
  } = splitScopedPatch(patch, ['data', 'style'])
  const fields: EdgeLabelFieldPatch = {}

  if (hasOwn(patch, 'text')) {
    fields.text = json.clone(patch.text)
  }
  if (hasOwn(patch, 't')) {
    fields.t = json.clone(patch.t)
  }
  if (hasOwn(patch, 'offset')) {
    fields.offset = json.clone(patch.offset)
  }

  return {
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(record ? { record } : {})
  }
}
