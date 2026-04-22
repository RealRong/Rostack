import { document as documentApi } from '@whiteboard/core/document'
import type { GroupCommand } from '../../types/command'
import type { CommandCompileContext } from '../types'
import { createCanvasOrderMoveOps } from './canvas'

export const compileGroupCommand = (
  command: GroupCommand,
  ctx: CommandCompileContext
) => {
  const document = ctx.tx.read.document.get()

  switch (command.type) {
    case 'group.merge': {
      const groupId = ctx.tx.ids.group()
      ctx.tx.emit({
        type: 'group.create',
        group: {
          id: groupId
        }
      })

      command.target.nodeIds?.forEach((nodeId) => {
        ctx.tx.emit({
          type: 'node.field.set',
          id: nodeId,
          field: 'groupId',
          value: groupId
        })
      })
      command.target.edgeIds?.forEach((edgeId) => {
        ctx.tx.emit({
          type: 'edge.field.set',
          id: edgeId,
          field: 'groupId',
          value: groupId
        })
      })

      return {
        groupId
      }
    }
    case 'group.order.move': {
      const refs = command.ids.flatMap((groupId) => documentApi.list.groupCanvasRefs(document, groupId))
      const current = document.canvas.order
      const target = (() => {
        const selected = refs.filter((ref) => current.some((entry) => entry.kind === ref.kind && entry.id === ref.id))
        if (selected.length === 0) {
          return current
        }
        if (command.mode === 'set') {
          return [...refs]
        }
        const rest = current.filter((entry) => !selected.some((ref) => ref.kind === entry.kind && ref.id === entry.id))
        if (command.mode === 'front') {
          return [...rest, ...selected]
        }
        if (command.mode === 'back') {
          return [...selected, ...rest]
        }
        const items = [...current]
        if (command.mode === 'forward') {
          for (let index = items.length - 2; index >= 0; index -= 1) {
            const currentRef = items[index]!
            const nextRef = items[index + 1]!
            const selectedCurrent = selected.some((ref) => ref.kind === currentRef.kind && ref.id === currentRef.id)
            const selectedNext = selected.some((ref) => ref.kind === nextRef.kind && ref.id === nextRef.id)
            if (selectedCurrent && !selectedNext) {
              items[index] = nextRef
              items[index + 1] = currentRef
            }
          }
          return items
        }
        for (let index = 1; index < items.length; index += 1) {
          const previousRef = items[index - 1]!
          const currentRef = items[index]!
          const selectedCurrent = selected.some((ref) => ref.kind === currentRef.kind && ref.id === currentRef.id)
          const selectedPrevious = selected.some((ref) => ref.kind === previousRef.kind && ref.id === previousRef.id)
          if (selectedCurrent && !selectedPrevious) {
            items[index - 1] = currentRef
            items[index] = previousRef
          }
        }
        return items
      })()

      createCanvasOrderMoveOps(current, target).forEach((op) => ctx.tx.emit(op))
      return
    }
    case 'group.ungroup': {
      const nodeIds: string[] = []
      const edgeIds: string[] = []

      command.ids.forEach((groupId) => {
        const refs = documentApi.list.groupCanvasRefs(document, groupId)
        ctx.tx.emit({
          type: 'group.delete',
          id: groupId
        })

        refs.forEach((ref) => {
          if (ref.kind === 'node') {
            nodeIds.push(ref.id)
            ctx.tx.emit({
              type: 'node.field.unset',
              id: ref.id,
              field: 'groupId'
            })
            return
          }

          edgeIds.push(ref.id)
          ctx.tx.emit({
            type: 'edge.field.unset',
            id: ref.id,
            field: 'groupId'
          })
        })
      })

      return {
        nodeIds,
        edgeIds
      }
    }
  }
}
