import type {
  GroupWriteOutput,
  WriteCommandMap
} from '@engine-types/command'
import type { TranslateResult } from '@engine-types/internal/translate'
import type { WriteTranslateContext } from './index'
import { cancelled, fromOps, success } from './result'
import {
  buildGroupMergeOperations,
  buildGroupUngroupManyOperations,
  buildGroupUngroupOperations
} from '@whiteboard/core/node'
import type {
  CanvasItemRef,
  EdgeId,
  GroupId,
  NodeId
} from '@whiteboard/core/types'
import { listCanvasItemRefs } from '@whiteboard/core/types'
import {
  isSameCanvasRef,
  normalizeCanvasOrderTargets
} from './order'

type GroupCommand = WriteCommandMap['group']
type MergeCommand = Extract<GroupCommand, { type: 'merge' }>
type OrderCommand = Extract<GroupCommand, { type: 'order' }>
type UngroupCommand = Extract<GroupCommand, { type: 'ungroup' }>
type UngroupManyCommand = Extract<GroupCommand, { type: 'ungroupMany' }>

export const translateGroup = <C extends GroupCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<GroupWriteOutput<C>> => {
  const merge = (
    command: MergeCommand
  ): TranslateResult<{ groupId: GroupId }> => {
    const nodeCount = command.target.nodeIds?.length ?? 0
    const edgeCount = command.target.edgeIds?.length ?? 0
    if (nodeCount + edgeCount < 2) {
      return cancelled('At least two items are required.')
    }

    return fromOps(
      buildGroupMergeOperations({
        target: command.target,
        doc: ctx.doc,
        createGroupId: ctx.ids.group
      }),
      ({ groupId }) => ({ groupId })
    )
  }

  const order = (
    command: OrderCommand
  ): TranslateResult<void> => {
    const groupIdSet = new Set(command.ids.filter((id) => Boolean(ctx.doc.groups[id])))
    if (!groupIdSet.size) {
      return cancelled('No groups selected.')
    }

    const refs: CanvasItemRef[] = []
    const seen = new Set<string>()
    for (const ref of listCanvasItemRefs(ctx.doc)) {
      const groupId = ref.kind === 'node'
        ? ctx.doc.nodes[ref.id]?.groupId
        : ctx.doc.edges[ref.id]?.groupId
      if (!groupId || !groupIdSet.has(groupId)) {
        continue
      }

      const key = `${ref.kind}:${ref.id}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      refs.push(ref)
    }

    if (!refs.length) {
      return cancelled('No groups selected.')
    }

    const { current, next } = normalizeCanvasOrderTargets({
      doc: ctx.doc,
      refs,
      mode: command.mode
    })
    if (
      current.length === next.length
      && current.every((ref, index) => isSameCanvasRef(ref, next[index]!))
    ) {
      return cancelled('Order is already current.')
    }

    return success([{
      type: 'canvas.order.set',
      refs: next
    }])
  }

  const ungroup = (
    command: UngroupCommand
  ): TranslateResult<{ nodeIds: NodeId[], edgeIds: EdgeId[] }> =>
    fromOps(
      buildGroupUngroupOperations(command.id, ctx.doc),
      ({ nodeIds, edgeIds }) => ({ nodeIds, edgeIds })
    )

  const ungroupMany = (
    command: UngroupManyCommand
  ): TranslateResult<{ nodeIds: NodeId[], edgeIds: EdgeId[] }> => {
    if (!command.ids.length) {
      return cancelled('No groups selected.')
    }

    return fromOps(
      buildGroupUngroupManyOperations(command.ids, ctx.doc),
      ({ nodeIds, edgeIds }) => ({ nodeIds, edgeIds })
    )
  }

  switch (command.type) {
    case 'merge':
      return merge(command) as TranslateResult<GroupWriteOutput<C>>
    case 'order':
      return order(command) as TranslateResult<GroupWriteOutput<C>>
    case 'ungroup':
      return ungroup(command) as TranslateResult<GroupWriteOutput<C>>
    case 'ungroupMany':
      return ungroupMany(command) as TranslateResult<GroupWriteOutput<C>>
    default:
      return cancelled('Unsupported group action.') as TranslateResult<GroupWriteOutput<C>>
  }
}
