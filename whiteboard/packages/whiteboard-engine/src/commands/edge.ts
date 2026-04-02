import type {
  EdgeBatchUpdate,
  WriteCommandMap
} from '@engine-types/command'
import type { EngineCommands } from '@engine-types/command'
import type { Apply } from '@engine-types/write'
import type {
  EdgeEnd,
  EdgeId,
  EdgeInput,
  EdgePatch,
  Origin,
  Point
} from '@whiteboard/core/types'

type EdgeCommand = WriteCommandMap['edge']

export const edge = ({
  apply
}: {
  apply: Apply
}): EngineCommands['edge'] => {
  const run = <C extends EdgeCommand>(
    command: C,
    origin: Origin = 'user'
  ) =>
    apply({
      domain: 'edge',
      command,
      origin
    })

  const create = (payload: EdgeInput) =>
    run({ type: 'create', payload })

  const move = (edgeId: EdgeId, delta: Point) =>
    run({
      type: 'move',
      edgeId,
      delta
    })

  const reconnect = (
    edgeId: EdgeId,
    end: 'source' | 'target',
    target: EdgeEnd
  ) => update(
    edgeId,
    end === 'source'
      ? { source: target }
      : { target }
  )

  const update = (id: EdgeId, patch: EdgePatch) =>
    run({
      type: 'updateMany',
      updates: [{ id, patch }]
    })

  const updateMany = (updates: readonly EdgeBatchUpdate[]) =>
    run({
      type: 'updateMany',
      updates
    })

  const remove = (ids: EdgeId[]) =>
    run({ type: 'delete', ids })

  const insert = (edgeId: EdgeId, point: Point) =>
    run({
      type: 'route',
      mode: 'insert',
      edgeId,
      point
    })

  const movePath = (edgeId: EdgeId, index: number, point: Point) =>
    run({
      type: 'route',
      mode: 'move',
      edgeId,
      index,
      point
    })

  const removeAt = (edgeId: EdgeId, index: number) =>
    run({
      type: 'route',
      mode: 'remove',
      edgeId,
      index
    })

  const clear = (edgeId: EdgeId) =>
    run({
      type: 'route',
      mode: 'clear',
      edgeId
    })

  const order = {
    set: (ids: EdgeId[]) => run({ type: 'order', mode: 'set', ids }),
    bringToFront: (ids: EdgeId[]) => run({ type: 'order', mode: 'front', ids }),
    sendToBack: (ids: EdgeId[]) => run({ type: 'order', mode: 'back', ids }),
    bringForward: (ids: EdgeId[]) => run({ type: 'order', mode: 'forward', ids }),
    sendBackward: (ids: EdgeId[]) => run({ type: 'order', mode: 'backward', ids })
  }

  return {
    create,
    move,
    reconnect,
    update,
    updateMany,
    delete: remove,
    route: {
      insert,
      move: movePath,
      remove: removeAt,
      clear
    },
    order
  }
}
