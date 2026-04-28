import {
  record as draftRecord,
  type Path
} from '@shared/draft'
import type {
  Edge,
  EdgeId,
  EdgeTemplate,
  EdgeUpdateInput
} from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { DocumentQuery } from '@whiteboard/editor-scene'
import type { EdgeWrite } from '@whiteboard/editor/write/types'
import {
  createEdgeLabelWrite
} from '@whiteboard/editor/write/edge/label'
import {
  createEdgeRouteWrite
} from '@whiteboard/editor/write/edge/route'

const readEdge = (
  read: (edgeId: EdgeId) => Edge | undefined,
  edgeId: EdgeId
) => read(edgeId)

const readCommittedEdge = (
  read: Pick<DocumentQuery, 'edge'>,
  edgeId: EdgeId
) => read.edge(edgeId)

const createStyleMutation = (
  path: Path,
  value: unknown
) => ({
  [`style.${path}`]: value
})

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
  read: Pick<DocumentQuery, 'edge'>,
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
  read: (edgeId: EdgeId) => Edge | undefined,
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
  read: (edgeId: EdgeId) => Edge | undefined,
  engine: Engine,
  path: Path,
  value: unknown
) => updateEdgesBy(edgeIds, read, engine, (edge) => {
  const current = draftRecord.read(edge.style, path)
  if (current === value) {
    return undefined
  }

  return {
    record: createStyleMutation(path, value)
  }
})

export const createEdgeWrite = ({
  engine,
  read
}: {
  engine: Engine
  read: {
    document: Pick<DocumentQuery, 'edge'>
    readEdge: (edgeId: EdgeId) => Edge | undefined
  }
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
  reconnectCommit: (input) => engine.execute({
    type: 'edge.reconnect.commit',
    ...input
  }),
  delete: (ids) => engine.execute({
    type: 'edge.delete',
    ids
  }),
  label: createEdgeLabelWrite(engine),
  route: createEdgeRouteWrite(engine),
  style: {
    color: (edgeIds, value) => updateEdgeStyle(edgeIds, read.readEdge, engine, 'color', value),
    opacity: (edgeIds, value) => updateEdgeStyle(edgeIds, read.readEdge, engine, 'opacity', value),
    width: (edgeIds, value) => updateEdgeStyle(edgeIds, read.readEdge, engine, 'width', value),
    dash: (edgeIds, value) => updateEdgeStyle(edgeIds, read.readEdge, engine, 'dash', value),
    start: (edgeIds, value) => updateEdgeStyle(edgeIds, read.readEdge, engine, 'start', value),
    end: (edgeIds, value) => updateEdgeStyle(edgeIds, read.readEdge, engine, 'end', value),
    swapMarkers: (edgeIds) => updateEdgesBy(edgeIds, read.readEdge, engine, (edge) => {
      const start = edge.style?.start
      const end = edge.style?.end
      if (start === end) {
        return undefined
      }

      return {
        record: {
          ...createStyleMutation('start', end),
          ...createStyleMutation('end', start)
        }
      }
    })
  },
  type: {
    set: (edgeIds, value) => updateEdgesBy(edgeIds, read.readEdge, engine, (edge) => (
      edge.type === value
        ? undefined
        : {
            fields: {
              type: value
            }
          }
    ))
  },
  lock: {
    set: (edgeIds, locked) => updateExistingEdges(read.document, engine, edgeIds, {
      fields: {
        locked
      }
    }),
    toggle: (edgeIds) => {
      const shouldLock = edgeIds.some((id) => !readCommittedEdge(read.document, id)?.locked)
      return updateExistingEdges(read.document, engine, edgeIds, {
        fields: {
          locked: shouldLock
        }
      })
    }
  },
  textMode: {
    set: (edgeIds, value) => updateExistingEdges(read.document, engine, edgeIds, {
      fields: {
        textMode: value
      }
    })
  }
})
