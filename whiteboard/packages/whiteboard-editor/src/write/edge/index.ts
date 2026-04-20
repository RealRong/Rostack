import type {
  Edge,
  EdgeId,
  EdgeTemplate,
  EdgeUpdateInput
} from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { EdgeWrite } from '@whiteboard/editor/write/types'
import {
  createEdgeLabelWrite
} from '@whiteboard/editor/write/edge/label'
import {
  createEdgeRouteWrite
} from '@whiteboard/editor/write/edge/route'

const readEdge = (
  read: Pick<EditorQuery, 'edge'>,
  edgeId: EdgeId
) => read.edge.item.get(edgeId)?.edge

const readCommittedEdge = (
  read: Pick<EditorQuery, 'edge'>,
  edgeId: EdgeId
) => read.edge.committed.get(edgeId)?.edge

const createStyleMutation = (
  path: string,
  value: unknown
) => value === undefined
  ? {
      scope: 'style' as const,
      op: 'unset' as const,
      path
    }
  : {
      scope: 'style' as const,
      op: 'set' as const,
      path,
      value
    }

const updateEdges = (
  engine: Engine,
  updates: readonly {
    id: EdgeId
    input: EdgeUpdateInput
  }[]
) => {
  if (!updates.length) {
    return undefined
  }

  return engine.execute({
    type: 'edge.update',
    updates
  })
}

const updateExistingEdges = (
  read: Pick<EditorQuery, 'edge'>,
  engine: Engine,
  edgeIds: readonly EdgeId[],
  input: EdgeUpdateInput
) => updateEdges(
  engine,
  edgeIds.flatMap((id) => readCommittedEdge(read, id)
    ? [{
        id,
        input
      }]
    : [])
)

const updateEdgesBy = (
  edgeIds: readonly EdgeId[],
  read: Pick<EditorQuery, 'edge'>,
  engine: Engine,
  buildInput: (edge: Edge) => EdgeUpdateInput | undefined
) => updateEdges(
  engine,
  edgeIds.flatMap((edgeId) => {
    const edge = readEdge(read, edgeId)
    if (!edge) {
      return []
    }

    const input = buildInput(edge)
    return input
      ? [{
          id: edgeId,
          input
        }]
      : []
  })
)

const updateEdgeStyle = (
  edgeIds: readonly EdgeId[],
  read: Pick<EditorQuery, 'edge'>,
  engine: Engine,
  path: string,
  value: unknown
) => updateEdgesBy(edgeIds, read, engine, (edge) => {
  const current = edge.style?.[path as keyof NonNullable<Edge['style']>]
  if (current === value) {
    return undefined
  }

  return {
    records: [
      createStyleMutation(path, value)
    ]
  }
})

const updateEdgeField = <Field extends keyof NonNullable<EdgeUpdateInput['fields']>>(
  edgeIds: readonly EdgeId[],
  read: Pick<EditorQuery, 'edge'>,
  engine: Engine,
  field: Field,
  value: NonNullable<EdgeUpdateInput['fields']>[Field]
) => updateEdgesBy(edgeIds, read, engine, (edge) => {
  const current = edge[field as keyof Edge]
  if (current === value) {
    return undefined
  }

  return {
    fields: {
      [field]: value
    }
  } as EdgeUpdateInput
})

export const createEdgeWrite = ({
  engine,
  read
}: {
  engine: Engine
  read: EditorQuery
}): EdgeWrite => ({
  create: (input: {
    from: import('@whiteboard/core/types').EdgeEnd
    to: import('@whiteboard/core/types').EdgeEnd
    template: EdgeTemplate
  }) => engine.execute({
    type: 'edge.create',
    input: {
      ...input.template,
      source: input.from,
      target: input.to
    }
  }),
  update: (id, input) => engine.execute({
    type: 'edge.update',
    updates: [{
      id,
      input
    }]
  }),
  updateMany: (updates) => engine.execute({
    type: 'edge.update',
    updates
  }),
  move: ({ ids, delta }) => engine.execute({
    type: 'edge.move',
    ids,
    delta
  }),
  reconnect: (edgeId, end, target) => engine.execute({
    type: 'edge.reconnect',
    edgeId,
    end,
    target
  }),
  delete: (ids) => engine.execute({
    type: 'edge.delete',
    ids
  }),
  label: createEdgeLabelWrite(engine),
  route: createEdgeRouteWrite(engine),
  style: {
    color: (edgeIds, value) => updateEdgeStyle(edgeIds, read, engine, 'color', value),
    opacity: (edgeIds, value) => updateEdgeStyle(edgeIds, read, engine, 'opacity', value),
    width: (edgeIds, value) => updateEdgeStyle(edgeIds, read, engine, 'width', value),
    dash: (edgeIds, value) => updateEdgeStyle(edgeIds, read, engine, 'dash', value),
    start: (edgeIds, value) => updateEdgeStyle(edgeIds, read, engine, 'start', value),
    end: (edgeIds, value) => updateEdgeStyle(edgeIds, read, engine, 'end', value),
    swapMarkers: (edgeIds) => updateEdgesBy(edgeIds, read, engine, (edge) => {
      const start = edge.style?.start
      const end = edge.style?.end
      if (start === end) {
        return undefined
      }

      return {
        records: [
          createStyleMutation('start', end),
          createStyleMutation('end', start)
        ]
      }
    })
  },
  type: {
    set: (edgeIds, value) => updateEdgeField(edgeIds, read, engine, 'type', value)
  },
  lock: {
    set: (edgeIds, locked) => updateExistingEdges(read, engine, edgeIds, {
      fields: {
        locked
      }
    }),
    toggle: (edgeIds) => {
      const shouldLock = edgeIds.some((id) => !readCommittedEdge(read, id)?.locked)
      return updateExistingEdges(read, engine, edgeIds, {
        fields: {
          locked: shouldLock
        }
      })
    }
  },
  textMode: {
    set: (edgeIds, value) => updateExistingEdges(read, engine, edgeIds, {
      fields: {
        textMode: value
      }
    })
  }
})
