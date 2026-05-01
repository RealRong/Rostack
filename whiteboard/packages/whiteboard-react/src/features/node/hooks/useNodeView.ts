import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import type { NodeId, NodeUpdateInput, Rect } from '@whiteboard/core/types'
import { useOptionalKeyedStoreValue } from '@shared/react'
import {
  useEditorRuntime,
  useNodeSpec
} from '@whiteboard/react/runtime/hooks'
import type { NodeRenderProps, NodeSpecEntry, NodeWrite } from '@whiteboard/react/types/node'

const buildNodeTransformStyle = (
  rect: Rect,
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
  rect: Rect,
  rotation: number
): CSSProperties => ({
  transform: `translate(${rect.x}px, ${rect.y}px)${rotation !== 0 ? ` rotate(${rotation}deg)` : ''}`,
  width: rect.width,
  height: rect.height,
  transformOrigin: rotation !== 0 ? 'center center' : undefined
})

const resolveDisplayRect = (
  view: RuntimeNodeView
): Rect => ({
  x: view.presentation?.position?.x ?? view.rect.x,
  y: view.presentation?.position?.y ?? view.rect.y,
  width: view.rect.width,
  height: view.rect.height
})

export type NodeView = {
  nodeId: NodeId
  node: RuntimeNodeView['node']
  rect: RuntimeNodeView['rect']
  rotation: number
  hidden: boolean
  resizing: boolean
  canConnect: boolean
  canResize: boolean
  canRotate: boolean
  nodeStyle: CSSProperties
  transformStyle: CSSProperties
  nodeSpec?: NodeSpecEntry
  renderProps: NodeRenderProps
}

export type NodeOverlayView = {
  nodeId: NodeView['nodeId']
  node: NodeView['node']
  rect: NodeView['rect']
  transformFrameStyle: CSSProperties
  rotation: NodeView['rotation']
  canConnect: NodeView['canConnect']
  canResize: NodeView['canResize']
  canRotate: NodeView['canRotate']
}
type RuntimeNodeView = NonNullable<
  ReturnType<ReturnType<typeof useEditorRuntime>['projection']['stores']['render']['node']['byId']['get']>
>

const resolveNodeCapability = (
  nodeSpec: NodeSpecEntry | undefined,
  owner: RuntimeNodeView['owner']
) => {
  const role = nodeSpec?.behavior.role ?? 'content'
  const mindmapOwned = owner?.kind === 'mindmap'

  return {
    connect: nodeSpec?.behavior.connect ?? true,
    resize: !mindmapOwned && (nodeSpec?.behavior.resize ?? true),
    rotate: !mindmapOwned && (
      typeof nodeSpec?.behavior.rotate === 'boolean'
        ? nodeSpec.behavior.rotate
        : role === 'content'
    )
  }
}

const resolveNodeOverlayViewState = (
  view: RuntimeNodeView,
  capability: ReturnType<typeof resolveNodeCapability>
): NodeOverlayView => {
  return {
    nodeId: view.node.id,
    node: view.node,
    rect: view.rect,
    transformFrameStyle: buildOverlayFrameStyle(view.rect, view.rotation),
    rotation: view.rotation,
    canConnect: capability.connect,
    canResize: capability.resize,
    canRotate: capability.rotate
  }
}

const resolveNodeViewState = (
  editor: Pick<ReturnType<typeof useEditorRuntime>, 'write'>,
  nodes: ReturnType<typeof useNodeSpec>,
  baseView: RuntimeNodeView,
  capability: ReturnType<typeof resolveNodeCapability>
): NodeView => {
  const nodeSpec = nodes.entryByType.resolve(baseView.node.type)
  const rect = resolveDisplayRect(baseView)
  const write: NodeWrite = {
    patch: (update: NodeUpdateInput) => {
      editor.write.node.patch([baseView.node.id], update)
    }
  }
  const renderProps: NodeRenderProps = {
    node: baseView.node,
    rect,
    rotation: baseView.rotation,
    selected: baseView.state.selected,
    hovered: baseView.state.hovered,
    edit: baseView.edit,
    write
  }
  const nodeStyle = nodeSpec?.behavior.style
    ? nodeSpec.behavior.style(renderProps)
    : {}
  const transformStyle = buildNodeTransformStyle(
    rect,
    baseView.rotation,
    nodeStyle
  )

  return {
    nodeId: baseView.node.id,
    node: baseView.node,
    rect,
    rotation: baseView.rotation,
    hidden: baseView.state.hidden,
    resizing: baseView.state.resizing,
    canConnect: capability.connect,
    canResize: capability.resize,
    canRotate: capability.rotate,
    nodeStyle,
    transformStyle,
    nodeSpec,
    renderProps
  }
}

export const useNodeView = (
  nodeId: NodeId | undefined
): NodeView | undefined => {
  const editor = useEditorRuntime()
  const nodes = useNodeSpec()
  const view = useOptionalKeyedStoreValue(
    editor.projection.stores.render.node.byId,
    nodeId,
    undefined
  )

  return useMemo(
    () => {
      if (!nodeId || !view) {
        return undefined
      }

      const capability = resolveNodeCapability(
        nodes.entryByType.resolve(view.node.type),
        view.owner
      )

      return resolveNodeViewState(editor, nodes, view, capability)
    },
    [editor, nodes, nodeId, view]
  )
}

export const useNodeOverlayView = (
  nodeId: NodeId | undefined
): NodeOverlayView | undefined => {
  const editor = useEditorRuntime()
  const nodes = useNodeSpec()
  const view = useOptionalKeyedStoreValue(
    editor.projection.stores.render.node.byId,
    nodeId,
    undefined
  )

  return useMemo(
    () => {
      if (!nodeId || !view) {
        return undefined
      }

      const capability = resolveNodeCapability(
        nodes.entryByType.resolve(view.node.type),
        view.owner
      )

      return resolveNodeOverlayViewState(view, capability)
    },
    [nodes, nodeId, view]
  )
}
