import { useMemo } from 'react'
import type { Rect } from '@whiteboard/core/types'
import type { SelectionAffordance } from '@whiteboard/core/selection'
import type {
  NodeSummary,
  NodeTypeSummary
} from './summary'
import {
  readNodeSummary
} from './summary'
import {
  useEdit,
  useEditor,
  useInteraction,
  useNodeRegistry,
  useStoreValue,
  useTool
} from '#react/runtime/hooks'
import type { WhiteboardRuntime as Editor } from '#react/types/runtime'
import type { NodeRegistry } from '#react/types/node'
import { selectNodesByTypeKey } from './actions'

type EditTarget = ReturnType<Editor['state']['edit']['get']>
type BaseSelection = {
  target: ReturnType<Editor['read']['selection']['target']['get']>
  summary: ReturnType<Editor['read']['selection']['summary']['get']>
  transformBox: ReturnType<Editor['read']['selection']['transformBox']['get']>
  affordance: SelectionAffordance
}
type Tool = ReturnType<Editor['state']['tool']['get']>

export type SelectionToolbarFilterView = {
  label: string
  types: readonly NodeTypeSummary[]
  onSelect: (key: string) => unknown
}

export type SelectionToolbarView = {
  filter?: SelectionToolbarFilterView
}

type SelectionView = BaseSelection & {
  toolbar?: SelectionToolbarView
  nodeSummary: NodeSummary
  boxState: SelectionBoxState
}

type SelectionBoxState = {
  box?: Rect
  transformBox?: Rect
  interactive: boolean
  frame: boolean
  handles: boolean
  canResize: boolean
}

type SelectionChrome = {
  toolbar: boolean
  transform: boolean
}

type SelectionPresentation = {
  selection: SelectionView
  chrome: SelectionChrome
  showToolbar: boolean
  singleTransformNodeId?: string
  showSelectionFrame: boolean
  showSelectionHandles: boolean
}

const EMPTY_SUMMARY: NodeSummary = {
  ids: [],
  count: 0,
  hasGroup: false,
  lock: 'none',
  types: [],
  mixed: false
}

const readObjectCountLabel = (
  count: number
) => count === 1 ? '1 object' : `${count} objects`

const readSelectionToolbarView = ({
  editor,
  selection,
  summary,
  registry
}: {
  editor: Editor
  selection: BaseSelection
  summary: NodeSummary
  registry: Pick<NodeRegistry, 'get'>
}): SelectionToolbarView | undefined => {
  const nodes = selection.summary.items.nodes
  const nodeIds = summary.ids

  if (!nodeIds.length || selection.summary.items.edgeCount > 0) {
    return undefined
  }

  const filter = summary.count > 1 && summary.types.length > 1
    ? {
        label: readObjectCountLabel(summary.count),
        types: summary.types,
        onSelect: (key: string) => {
          selectNodesByTypeKey({
            editor,
            registry,
            nodes,
            key
          })
        }
      } satisfies SelectionToolbarFilterView
    : undefined

  return {
    filter
  }
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

const resolveSelectionChrome = ({
  tool,
  edit,
  selection,
  transforming,
  chrome
}: {
  tool: Tool
  edit: EditTarget
  selection: SelectionView
  transforming: boolean
  chrome: boolean
}): SelectionChrome => {
  const editing = edit !== null
  const pureNodeSelection =
    (selection.summary.kind === 'node' || selection.summary.kind === 'nodes')
    && selection.summary.items.edgeCount === 0
  const hasTransformChrome =
    selection.affordance.canResize
    || selection.affordance.canRotate

  return {
    toolbar:
      tool.type === 'select'
      && !editing
      && chrome
      && pureNodeSelection,
    transform:
      tool.type === 'select'
      && !editing
      && hasTransformChrome
      && (
        transforming
        || chrome
      )
  }
}

const resolveSelectionPresentation = (
  selection: SelectionView,
  chrome: SelectionChrome
): SelectionPresentation => {
  const singleTransformNodeId = selection.affordance.showSingleNodeOverlay
    ? selection.affordance.ownerNodeId
    : undefined

  return {
    selection,
    chrome,
    showToolbar: chrome.toolbar,
    singleTransformNodeId,
    showSelectionFrame:
      selection.boxState.frame
      && singleTransformNodeId === undefined,
    showSelectionHandles:
      chrome.transform
      && selection.boxState.handles
      && singleTransformNodeId === undefined
  }
}

const resolveSelectionView = (
  editor: Editor,
  selection: BaseSelection,
  registry: Pick<NodeRegistry, 'get'>
): SelectionView => {
  const boxState = resolveSelectionBoxState(selection)
  const pureNodeSelection =
    selection.summary.items.nodeCount > 0
    && selection.summary.items.edgeCount === 0
  const nodeSummary = pureNodeSelection
    ? readNodeSummary({
        summary: selection.summary,
        registry
      })
    : EMPTY_SUMMARY

  return {
    ...selection,
    toolbar: pureNodeSelection
      ? readSelectionToolbarView({
          editor,
          selection,
          summary: nodeSummary,
          registry
        })
      : undefined,
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
    () => resolveSelectionView(editor, {
      target,
      summary,
      transformBox,
      affordance
    }, registry),
    [affordance, editor, registry, summary, target, transformBox]
  )
}

export const useSelectionPresentation = () => {
  const selection = useSelection()
  const tool = useTool()
  const edit = useEdit()
  const interaction = useInteraction()

  return useMemo(() => {
    const chrome = resolveSelectionChrome({
      tool,
      edit,
      selection,
      transforming: interaction.transforming,
      chrome: interaction.chrome
    })

    return resolveSelectionPresentation(selection, chrome)
  }, [edit, interaction.chrome, interaction.transforming, selection, tool])
}
