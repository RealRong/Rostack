import { applyPathMutation } from '@whiteboard/core/utils/recordMutation'
import type {
  EdgeLabel,
  EdgeLabelUpdateInput
} from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { EdgeLabelWrite } from '@whiteboard/editor/write/types'
import { buildEdgeLabelTextMetricsSpec } from '@whiteboard/editor/edge/label'

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

const readCurrentLabel = (
  read: Pick<EditorQuery, 'edge'>,
  edgeId: string,
  labelId: string
) => read.edge.item.get(edgeId)?.edge.labels?.find((entry) => entry.id === labelId)

const projectScopeValue = (
  current: unknown,
  input: EdgeLabelUpdateInput,
  scope: 'style' | 'data'
) => {
  let next = current

  input.records?.forEach((record) => {
    if (record.scope !== scope) {
      return
    }

    const result = applyPathMutation(next, record)
    if (!result.ok) {
      return
    }

    next = result.value
  })

  return next
}

const projectLabel = (
  label: EdgeLabel,
  input: EdgeLabelUpdateInput
): EdgeLabel => {
  const next: EdgeLabel = {
    ...label
  }
  const fields = input.fields

  if (fields && hasOwn(fields, 'text')) {
    if (fields.text === undefined) {
      delete next.text
    } else {
      next.text = fields.text
    }
  }
  if (fields && hasOwn(fields, 't')) {
    if (fields.t === undefined) {
      delete next.t
    } else {
      next.t = fields.t
    }
  }
  if (fields && hasOwn(fields, 'offset')) {
    if (fields.offset === undefined) {
      delete next.offset
    } else {
      next.offset = fields.offset
    }
  }

  const style = projectScopeValue(next.style, input, 'style')
  if (style === undefined) {
    delete next.style
  } else {
    next.style = style as Record<string, unknown>
  }

  const data = projectScopeValue(next.data, input, 'data')
  if (data === undefined) {
    delete next.data
  } else {
    next.data = data as Record<string, unknown>
  }

  return next
}

const ensureEdgeLabelMetrics = (
  layout: Pick<EditorLayout, 'text'>,
  label: Pick<EdgeLabel, 'text' | 'style'>
) => {
  layout.text.ensure(buildEdgeLabelTextMetricsSpec({
    text: typeof label.text === 'string' ? label.text : '',
    style: label.style
  }))
}

export const createEdgeLabelWrite = ({
  engine,
  read,
  layout
}: {
  engine: Engine
  read: Pick<EditorQuery, 'edge'>
  layout: Pick<EditorLayout, 'text'>
}): EdgeLabelWrite => ({
  insert: (edgeId, label, to) => {
    ensureEdgeLabelMetrics(layout, {
      text: label?.text,
      style: label?.style
    })

    return engine.execute({
      type: 'edge.label.insert',
      edgeId,
      label: label ?? {},
      to
    })
  },
  update: (edgeId, labelId, input) => {
    const currentLabel = readCurrentLabel(read, edgeId, labelId)
    if (currentLabel) {
      ensureEdgeLabelMetrics(layout, projectLabel(currentLabel, input))
    }

    return engine.execute({
      type: 'edge.label.update',
      edgeId,
      labelId,
      input
    })
  },
  move: (edgeId, labelId, to) => engine.execute({
    type: 'edge.label.move',
    edgeId,
    labelId,
    to
  }),
  delete: (edgeId, labelId) => engine.execute({
    type: 'edge.label.delete',
    edgeId,
    labelId
  })
})
