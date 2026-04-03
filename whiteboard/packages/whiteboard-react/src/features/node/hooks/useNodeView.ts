import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import type { NodeItem } from '@whiteboard/engine'
import type { NodeId } from '@whiteboard/core/types'
import type { WhiteboardRuntime as Editor } from '../../../types/runtime'
import { useEditorRuntime } from '../../../runtime/hooks/useEditor'
import { useNodeRegistry } from '../../../runtime/hooks/useEnvironment'
import { useOptionalKeyedStoreValue } from '../../../runtime/hooks/useStoreValue'
import type { NodeDefinition, NodeRegistry, NodeRenderProps, NodeWrite } from '../../../types/node'

const buildNodeTransformStyle = (
  rect: NodeItem['rect'],
  rotation: number,
  nodeStyle: CSSProperties
): CSSProperties => {
  const extraTransform = nodeStyle.transform
  const baseTransform = `translate(${rect.x}px, ${rect.y}px)`
  const rotationTransform = rotation !== 0 ? `rotate(${rotation}deg)` : undefined
  const transform = [baseTransform, extraTransform, rotationTransform]
    .filter(Boolean)
    .join(' ')

  return {
    transform: transform || undefined,
    transformOrigin: rotationTransform ? 'center center' : nodeStyle.transformOrigin
  }
}

const buildOverlayFrameStyle = (
  rect: NodeItem['rect'],
  rotation: number
): CSSProperties => ({
  transform: `translate(${rect.x}px, ${rect.y}px)${rotation !== 0 ? ` rotate(${rotation}deg)` : ''}`,
  width: rect.width,
  height: rect.height,
  transformOrigin: rotation !== 0 ? 'center center' : undefined
})

export type NodeView = {
  nodeId: NodeId
  node: NodeItem['node']
  rect: NodeItem['rect']
  frameRect: NodeItem['rect']
  rotation: number
  hidden: boolean
  resizing: boolean
  canConnect: boolean
  canResize: boolean
  canRotate: boolean
  nodeStyle: CSSProperties
  transformStyle: CSSProperties
  definition?: NodeDefinition
  renderProps: NodeRenderProps
}

export type NodeOverlayView = {
  nodeId: NodeView['nodeId']
  node: NodeView['node']
  rect: NodeView['rect']
  transformRect: NodeView['frameRect']
  transformFrameStyle: CSSProperties
  rotation: NodeView['rotation']
  canConnect: NodeView['canConnect']
  canResize: NodeView['canResize']
  canRotate: NodeView['canRotate']
}

const EMPTY_NODE_STATE: ReturnType<Editor['read']['node']['state']['get']> = {
  hovered: false,
  hidden: false,
  patched: false,
  resizing: false
}

const resolveNodeOverlayViewState = (
  editor: Pick<Editor, 'read'>,
  nodeId: NodeId,
  item: NodeItem
): NodeOverlayView => {
  const node = item.node
  const rect = item.rect
  const transformRect = editor.read.node.outline(nodeId) ?? rect
  const rotation = node.type === 'group'
    ? 0
    : (typeof node.rotation === 'number' ? node.rotation : 0)
  const capability = editor.read.node.capability(node)

  return {
    nodeId,
    node,
    rect,
    transformRect,
    transformFrameStyle: buildOverlayFrameStyle(transformRect, rotation),
    rotation,
    canConnect: capability.connect,
    canResize: capability.resize,
    canRotate: capability.rotate
  }
}

const resolveNodeViewState = (
  editor: Pick<Editor, 'commands' | 'read'>,
  registry: Pick<NodeRegistry, 'get'>,
  nodeId: NodeId,
  item: NodeItem,
  state: ReturnType<Editor['read']['node']['state']['get']>,
  selected: boolean
): NodeView => {
  const resolvedNode = item.node
  const rect = item.rect
  const frameRect = editor.read.node.outline(nodeId) ?? rect
  const hidden = state.hidden
  const resizing = state.resizing
  const rotation = resolvedNode.type === 'group'
    ? 0
    : (typeof resolvedNode.rotation === 'number' ? resolvedNode.rotation : 0)
  const definition = registry.get(resolvedNode.type)
  const write: NodeWrite = {
    update: (update) => {
      editor.commands.node.document.update(nodeId, update)
    }
  }
  const renderProps: NodeRenderProps = {
    node: resolvedNode,
    rect,
    selected,
    hovered: state.hovered,
    write
  }
  const capability = editor.read.node.capability(resolvedNode)
  const nodeStyle = definition?.style
    ? definition.style(renderProps)
    : {}
  const transformStyle = buildNodeTransformStyle(rect, rotation, nodeStyle)

  return {
    nodeId,
    node: resolvedNode,
    rect,
    frameRect,
    rotation,
    hidden,
    resizing,
    canConnect: capability.connect,
    canResize: capability.resize,
    canRotate: capability.rotate,
    nodeStyle,
    transformStyle,
    definition,
    renderProps
  }
}

export const useNodeView = (
  nodeId: NodeId | undefined,
  {
    selected = false
  }: {
    selected?: boolean
  } = {}
): NodeView | undefined => {
  const editor = useEditorRuntime()
  const registry = useNodeRegistry()
  const item = useOptionalKeyedStoreValue(
    editor.read.node.item,
    nodeId,
    undefined
  )
  const state = useOptionalKeyedStoreValue(
    editor.read.node.state,
    nodeId,
    EMPTY_NODE_STATE
  )

  return useMemo(
    () => {
      if (!nodeId || !item) {
        return undefined
      }

      return resolveNodeViewState(editor, registry, nodeId, item, state, selected)
    },
    [editor, registry, state, item, nodeId, selected]
  )
}

export const useNodeOverlayView = (
  nodeId: NodeId | undefined
): NodeOverlayView | undefined => {
  const editor = useEditorRuntime()
  const item = useOptionalKeyedStoreValue(
    editor.read.node.item,
    nodeId,
    undefined
  )

  return useMemo(
    () => {
      if (!nodeId || !item) {
        return undefined
      }

      return resolveNodeOverlayViewState(editor, nodeId, item)
    },
    [editor, item, nodeId]
  )
}
