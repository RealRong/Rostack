import type { RuntimeRead } from '../../../query'
import type { SelectionModelRead } from '../../../query/selection/model'
import type { PointerDownInput } from '../../../types/input'
import type {
  SelectionPressResolution
} from './resolve'
import {
  resolveSelectionPress,
  resolveSelectionPressTarget
} from './resolve'

export const startSelectionPressAction = <TField extends string>(
  input: {
    read: Pick<RuntimeRead, 'tool' | 'node' | 'group'>
    selection: Pick<SelectionModelRead, 'get'>
    pointer: PointerDownInput
  }
): SelectionPressResolution<TField> | undefined => {
  const tool = input.read.tool.get()

  if (
    tool.type !== 'select'
    || input.pointer.pick.kind === 'edge'
    || input.pointer.pick.kind === 'mindmap'
    || input.pointer.editable
    || input.pointer.ignoreInput
    || input.pointer.ignoreSelection
  ) {
    return undefined
  }

  const target = resolveSelectionPressTarget<TField>(input.pointer.pick)
  if (!target) {
    return undefined
  }

  const selectionModel = input.selection.get()

  return resolveSelectionPress({
    node: {
      get: (nodeId) => input.read.node.item.get(nodeId)?.node,
      canEnter: (nodeId) => {
        const node = input.read.node.item.get(nodeId)?.node
        return node
          ? input.read.node.capability(node).enter
          : false
      },
      groupId: input.read.group.ofNode
    },
    group: {
      target: (groupId) => input.read.group.target(groupId)
    }
  }, {
    modifiers: input.pointer.modifiers,
    selection: selectionModel.summary,
    affordance: selectionModel.affordance,
    target
  })
}
