import { useMemo } from 'react'
import type { Rect } from '@whiteboard/core/types'
import { useStoreValue } from '@shared/react'
import {
  readSelectionNodeSummary,
  type SelectionNodeSummary
} from '@whiteboard/editor'
import type { SelectionAffordance } from '@whiteboard/core/selection'
import {
  useEditor,
  useNodeRegistry
} from '#react/runtime/hooks'
import type { WhiteboardRuntime as Editor } from '#react/types/runtime'
import type { NodeRegistry } from '#react/types/node'

type BaseSelection = {
  target: ReturnType<Editor['read']['selection']['target']['get']>
  summary: ReturnType<Editor['read']['selection']['summary']['get']>
  transformBox: ReturnType<Editor['read']['selection']['transformBox']['get']>
  affordance: SelectionAffordance
}

type SelectionBoxState = {
  box?: Rect
  transformBox?: Rect
  interactive: boolean
  frame: boolean
  handles: boolean
  canResize: boolean
}

type SelectionView = BaseSelection & {
  nodeSummary: SelectionNodeSummary
  boxState: SelectionBoxState
}

const EMPTY_SUMMARY: SelectionNodeSummary = {
  ids: [],
  count: 0,
  hasGroup: false,
  lock: 'none',
  types: [],
  mixed: false
}

const resolveSelectionBoxState = (
  selection: BaseSelection
): SelectionBoxState => {
  const box = selection.affordance.displayBox
  const transformBox = selection.affordance.transformBox
  const canMove = selection.affordance.canMove
  const canResize = selection.affordance.canResize

  return {
    box,
    transformBox,
    interactive:
      canMove
      && selection.affordance.moveHit === 'body',
    frame: Boolean(box) && selection.affordance.owner !== 'none',
    handles: Boolean(transformBox) && canResize,
    canResize
  }
}

const resolveSelectionView = (
  selection: BaseSelection,
  registry: Pick<NodeRegistry, 'get'>
): SelectionView => {
  const boxState = resolveSelectionBoxState(selection)
  const pureNodeSelection =
    selection.summary.items.nodeCount > 0
    && selection.summary.items.edgeCount === 0
  const nodeSummary = pureNodeSelection
    ? readSelectionNodeSummary({
        summary: selection.summary,
        registry
      })
    : EMPTY_SUMMARY

  return {
    ...selection,
    nodeSummary,
    boxState
  }
}

export const useSelection = () => {
  const editor = useEditor()
  const registry = useNodeRegistry()
  const target = useStoreValue(editor.read.selection.target)
  const summary = useStoreValue(editor.read.selection.summary)
  const transformBox = useStoreValue(editor.read.selection.transformBox)
  const affordance = useStoreValue(editor.read.selection.affordance)

  return useMemo(
    () => resolveSelectionView({
      target,
      summary,
      transformBox,
      affordance
    }, registry),
    [affordance, registry, summary, target, transformBox]
  )
}
