import { json } from '@shared/core'
import type { RecordWrite } from '@shared/draft'
import type {
  DocumentPatch,
  EdgeLabelPatch,
  EdgePatch,
  EdgeUpdateInput,
  MindmapTopicPatch,
  MindmapTopicUpdateInput,
  NodePatch,
  NodeUpdateInput
} from '@whiteboard/core/types'

const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const appendPath = (
  base: string,
  key: string
): string => base
  ? `${base}.${key}`
  : key

const collectRecordWrites = (
  value: unknown,
  basePath: string,
  target: Record<string, unknown>
): void => {
  if (!isObjectRecord(value)) {
    target[basePath] = json.clone(value)
    return
  }

  const keys = Object.keys(value)
  if (keys.length === 0) {
    return
  }

  keys.forEach((key) => {
    collectRecordWrites(value[key], appendPath(basePath, key), target)
  })
}

const setNestedPatchValue = (
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown
): void => {
  const [head, ...rest] = path
  if (!head) {
    return
  }

  if (rest.length === 0) {
    target[head] = json.clone(value)
    return
  }

  const current = target[head]
  const next = isObjectRecord(current)
    ? current
    : {}
  target[head] = next
  setNestedPatchValue(next, rest, value)
}

const compactRecordWrite = (
  target: Record<string, unknown>
): RecordWrite | undefined => Object.keys(target).length
  ? Object.freeze(target)
  : undefined

const readScopedRecordWrite = (
  patch: Record<string, unknown>,
  scopes: readonly string[]
): RecordWrite | undefined => {
  const writes: Record<string, unknown> = {}

  scopes.forEach((scope) => {
    if (!Object.hasOwn(patch, scope)) {
      return
    }

    const value = patch[scope]
    if (value === undefined) {
      writes[scope] = undefined
      return
    }

    collectRecordWrites(value, scope, writes)
  })

  return compactRecordWrite(writes)
}

const applyScopedRecordWriteToPatch = <TPatch extends Record<string, unknown>>(
  patch: TPatch,
  record: RecordWrite | undefined,
  scopes: readonly string[]
): TPatch => {
  if (!record) {
    return patch
  }

  const target: Record<string, unknown> = patch
  Object.entries(record).forEach(([path, value]) => {
    const [scope, ...rest] = path.split('.')
    if (!scope || !scopes.includes(scope)) {
      return
    }

    if (rest.length === 0) {
      target[scope] = json.clone(value)
      return
    }

    const current = target[scope]
    const next = isObjectRecord(current)
      ? current
      : {}
    target[scope] = next
    setNestedPatchValue(next, rest, value)
  })

  return patch
}

export const createDocumentPatch = (input: {
  background?: import('@whiteboard/core/types').Document['background']
}): DocumentPatch => ({
  ...(Object.hasOwn(input, 'background')
    ? {
        background: json.clone(input.background)
      }
    : {})
})

export const createNodePatch = (
  update: NodeUpdateInput
): NodePatch => applyScopedRecordWriteToPatch({
  ...(update.fields ? json.clone(update.fields) : {})
}, update.record, ['data', 'style'])

export const splitNodePatch = (
  patch: NodePatch
): NodeUpdateInput => {
  const {
    data: _data,
    style: _style,
    ...fields
  } = patch

  return {
    ...(Object.keys(fields).length
      ? {
          fields
        }
      : {}),
    ...(readScopedRecordWrite(patch, ['data', 'style'])
      ? {
          record: readScopedRecordWrite(patch, ['data', 'style'])
        }
      : {})
  }
}

export const createEdgePatch = (
  update: EdgeUpdateInput
): EdgePatch => applyScopedRecordWriteToPatch({
  ...(update.fields ? json.clone(update.fields) : {})
}, update.record, ['route', 'style', 'labels', 'data'])

export const splitEdgePatch = (
  patch: EdgePatch
): EdgeUpdateInput => {
  const {
    route: _route,
    style: _style,
    labels: _labels,
    data: _data,
    ...fields
  } = patch

  return {
    ...(Object.keys(fields).length
      ? {
          fields
        }
      : {}),
    ...(readScopedRecordWrite(patch, ['route', 'style', 'labels', 'data'])
      ? {
          record: readScopedRecordWrite(patch, ['route', 'style', 'labels', 'data'])
        }
      : {})
  }
}

export const createEdgeLabelPatch = (
  input: {
    fields?: import('@whiteboard/core/types').EdgeLabelFieldPatch
    record?: RecordWrite
  }
): EdgeLabelPatch => applyScopedRecordWriteToPatch({
  ...(input.fields ? json.clone(input.fields) : {})
}, input.record, ['data', 'style'])

export const splitEdgeLabelPatch = (
  patch: EdgeLabelPatch
): {
  fields?: import('@whiteboard/core/types').EdgeLabelFieldPatch
  record?: RecordWrite
} => {
  const {
    data: _data,
    style: _style,
    ...fields
  } = patch

  return {
    ...(Object.keys(fields).length
      ? {
          fields
        }
      : {}),
    ...(readScopedRecordWrite(patch, ['data', 'style'])
      ? {
          record: readScopedRecordWrite(patch, ['data', 'style'])
        }
      : {})
  }
}

export const createMindmapTopicPatch = (
  input: MindmapTopicUpdateInput
): MindmapTopicPatch => applyScopedRecordWriteToPatch({
  ...(input.fields ? json.clone(input.fields) : {})
}, input.record, ['data', 'style'])

export const splitMindmapTopicPatch = (
  patch: MindmapTopicPatch
): MindmapTopicUpdateInput => {
  const {
    data: _data,
    style: _style,
    ...fields
  } = patch

  return {
    ...(Object.keys(fields).length
      ? {
          fields
        }
      : {}),
    ...(readScopedRecordWrite(patch, ['data', 'style'])
      ? {
          record: readScopedRecordWrite(patch, ['data', 'style'])
        }
      : {})
  }
}
