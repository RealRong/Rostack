import { useMemo } from 'react'
import type {
  NodeAlignMode,
  NodeDistributeMode
} from '@whiteboard/core/node'
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
  type SelectionCan,
  readSelectionCan
} from '../selection/capability'
import {
  useEdit,
  useEditor,
  useInteraction,
  useTool
} from '../../runtime/hooks/useEditor'
import {
  useNodeRegistry,
  useWhiteboardServices
} from '../../runtime/hooks/useWhiteboard'
import { useStoreValue } from '../../runtime/hooks/useStoreValue'
import type { WhiteboardRuntime as Editor } from '../../types/runtime'
import type { NodeRegistry } from '../../types/node'
import type { ClipboardBridge } from '../../runtime/bridge/clipboard'
import { selectNodesByTypeKey } from './actions'
import {
  deleteSelectionAndClear,
  duplicateSelectionAndSelect,
  mergeGroupSelectionAndSelect,
  orderSelection,
  ungroupSelectionAndSelect
} from '../../runtime/commands'

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

export type SelectionMoreMenuItemView = {
  key: string
  label: string
  disabled?: boolean
  tone?: 'danger'
  onSelect: () => unknown
}

export type SelectionMoreMenuSectionView = {
  key: string
  title: string
  items: readonly SelectionMoreMenuItemView[]
}

export type SelectionToolbarView = {
  filter?: SelectionToolbarFilterView
  moreSections: readonly SelectionMoreMenuSectionView[]
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

const EMPTY_SELECTION_CAN: SelectionCan = {
  order: false,
  makeGroup: false,
  ungroup: false,
  copy: false,
  cut: false,
  duplicate: false,
  delete: false,
  align: false,
  distribute: false,
  wholeGroupIds: []
}

const ORDER_ITEMS = [
  { key: 'order.front', label: 'Bring to front', mode: 'front' as const },
  { key: 'order.forward', label: 'Bring forward', mode: 'forward' as const },
  { key: 'order.backward', label: 'Send backward', mode: 'backward' as const },
  { key: 'order.back', label: 'Send to back', mode: 'back' as const }
] as const

const ALIGN_ITEMS = [
  { key: 'layout.align.top', label: 'Align top', mode: 'top' as const },
  { key: 'layout.align.left', label: 'Align left', mode: 'left' as const },
  { key: 'layout.align.right', label: 'Align right', mode: 'right' as const },
  { key: 'layout.align.bottom', label: 'Align bottom', mode: 'bottom' as const },
  { key: 'layout.align.horizontal', label: 'Align horizontal center', mode: 'horizontal' as const },
  { key: 'layout.align.vertical', label: 'Align vertical center', mode: 'vertical' as const }
] as const

const DISTRIBUTE_ITEMS = [
  {
    key: 'layout.distribute.horizontal',
    label: 'Distribute horizontally',
    mode: 'horizontal' as const
  },
  {
    key: 'layout.distribute.vertical',
    label: 'Distribute vertically',
    mode: 'vertical' as const
  }
] as const

const bindAsyncClose = <Args extends unknown[]>(
  action: (...args: Args) => unknown
) => (...args: Args) => action(...args)

const readObjectCountLabel = (
  count: number
) => count === 1 ? '1 object' : `${count} objects`

const readSelectionToolbarView = ({
  editor,
  clipboard,
  selection,
  summary,
  selectionCan,
  registry
}: {
  editor: Editor
  clipboard: ClipboardBridge
  selection: BaseSelection
  summary: NodeSummary
  selectionCan: SelectionCan
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
        onSelect: bindAsyncClose((key: string) => {
          selectNodesByTypeKey({
            editor,
            registry,
            nodes,
            key
          })
        })
      } satisfies SelectionToolbarFilterView
    : undefined

  const order = (mode: 'front' | 'forward' | 'backward' | 'back') => {
    orderSelection(editor, {
      nodeIds
    }, mode === 'back' ? 'back' : mode)
  }

  return {
    filter,
    moreSections: [
      ...(selectionCan.order
        ? [
            {
              key: 'layer',
              title: 'Layer',
              items: ORDER_ITEMS.map((item) => ({
                key: item.key,
                label: item.label,
                onSelect: () => {
                  order(item.mode)
                }
              }))
            } satisfies SelectionMoreMenuSectionView
          ]
        : []),
      ...((selectionCan.makeGroup || selectionCan.ungroup)
        ? [
            {
              key: 'structure',
              title: 'Structure',
              items: [
                {
                  key: 'structure.group',
                  label: 'Group',
                  disabled: !selectionCan.makeGroup,
                  onSelect: () => {
                    if (nodeIds.length < 2) {
                      return
                    }

                    mergeGroupSelectionAndSelect(editor, {
                      nodeIds
                    })
                  }
                },
                {
                  key: 'structure.ungroup',
                  label: 'Ungroup',
                  disabled: !selectionCan.ungroup,
                  onSelect: () => {
                    if (!selectionCan.wholeGroupIds.length) {
                      return
                    }

                    ungroupSelectionAndSelect(editor, selectionCan.wholeGroupIds)
                  }
                }
              ]
            } satisfies SelectionMoreMenuSectionView
          ]
        : []),
      ...((selectionCan.align || selectionCan.distribute)
        ? [
            {
              key: 'layout',
              title: 'Layout',
              items: [
                ...(selectionCan.align
                  ? ALIGN_ITEMS.map((item) => ({
                      key: item.key,
                      label: item.label,
                      onSelect: () => {
                        if (nodeIds.length < 2) {
                          return
                        }

                        editor.commands.node.align([...nodeIds], item.mode as NodeAlignMode)
                      }
                    }))
                  : []),
                ...(selectionCan.distribute
                  ? DISTRIBUTE_ITEMS.map((item) => ({
                      key: item.key,
                      label: item.label,
                      onSelect: () => {
                        if (nodeIds.length < 3) {
                          return
                        }

                        editor.commands.node.distribute(
                          [...nodeIds],
                          item.mode as NodeDistributeMode
                        )
                      }
                    }))
                  : [])
              ]
            } satisfies SelectionMoreMenuSectionView
          ]
        : []),
      {
        key: 'edit',
        title: 'Edit',
        items: [
          {
            key: 'edit.copy',
            label: 'Copy',
            disabled: !selectionCan.copy,
            onSelect: () => {
              if (!nodeIds.length) {
                return
              }

              return clipboard.copy({
                nodeIds
              })
            }
          },
          {
            key: 'edit.cut',
            label: 'Cut',
            disabled: !selectionCan.cut,
            onSelect: () => {
              if (!nodeIds.length) {
                return
              }

              return clipboard.cut({
                nodeIds
              })
            }
          },
          {
            key: 'edit.duplicate',
            label: 'Duplicate',
            disabled: !selectionCan.duplicate,
            onSelect: () => {
              if (!nodeIds.length) {
                return
              }

              duplicateSelectionAndSelect(editor, {
                nodeIds
              })
            }
          }
        ]
      },
      ...(selectionCan.delete
        ? [
            {
              key: 'danger',
              title: 'Danger',
              items: [
                {
                  key: 'danger.delete',
                  label: 'Delete',
                  tone: 'danger' as const,
                  onSelect: () => {
                    deleteSelectionAndClear(editor, {
                      nodeIds
                    })
                  }
                }
              ]
            } satisfies SelectionMoreMenuSectionView
          ]
        : [])
    ]
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
  clipboard: ClipboardBridge,
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
  const selectionCan = pureNodeSelection
    ? readSelectionCan({
        editor,
        summary: selection.summary
      })
    : EMPTY_SELECTION_CAN

  return {
    ...selection,
    toolbar: pureNodeSelection
      ? readSelectionToolbarView({
          editor,
          clipboard,
          selection,
          summary: nodeSummary,
          selectionCan,
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
  const { clipboard } = useWhiteboardServices()
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
    }, clipboard, registry),
    [affordance, clipboard, editor, registry, summary, target, transformBox]
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
