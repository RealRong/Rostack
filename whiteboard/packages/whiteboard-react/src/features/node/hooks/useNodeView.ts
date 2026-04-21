import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import type { NodeId, NodeUpdateInput, Rect } from '@whiteboard/core/types'
import { useOptionalKeyedStoreValue } from '@shared/react'
import {
  useEditorRuntime,
  useNodeRegistry
} from '@whiteboard/react/runtime/hooks'
import type { NodeDefinition, NodeRegistry, NodeRenderProps, NodeWrite } from '@whiteboard/react/types/node'

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
  definition?: NodeDefinition
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
  ReturnType<ReturnType<typeof useEditorRuntime>['read']['node']['render']['get']>
>
const resolveNodeOverlayViewState = (
  view: RuntimeNodeView
): NodeOverlayView => {
  return {
    nodeId: view.nodeId,
    node: view.node,
    rect: view.rect,
    transformFrameStyle: buildOverlayFrameStyle(view.rect, view.rotation),
    rotation: view.rotation,
    canConnect: view.canConnect,
    canResize: view.canResize,
    canRotate: view.canRotate
  }
}

const resolveNodeViewState = (
  editor: Pick<ReturnType<typeof useEditorRuntime>, 'actions'>,
  registry: Pick<NodeRegistry, 'get'>,
  baseView: RuntimeNodeView,
): NodeView => {
  const definition = registry.get(baseView.node.type)
  const write: NodeWrite = {
    patch: (update: NodeUpdateInput) => {
      editor.actions.node.patch([baseView.nodeId], update)
    }
  }
  const renderProps: NodeRenderProps = {
    node: baseView.node,
    rect: baseView.rect,
    rotation: baseView.rotation,
    selected: baseView.selected,
    hovered: baseView.hovered,
    edit: baseView.edit,
    write
  }
  const nodeStyle = definition?.style
    ? definition.style(renderProps)
    : {}
  const transformStyle = buildNodeTransformStyle(baseView.rect, baseView.rotation, nodeStyle)

  return {
    nodeId: baseView.nodeId,
    node: baseView.node,
    rect: baseView.rect,
    rotation: baseView.rotation,
    hidden: baseView.hidden,
    resizing: baseView.resizing,
    canConnect: baseView.canConnect,
    canResize: baseView.canResize,
    canRotate: baseView.canRotate,
    nodeStyle,
    transformStyle,
    definition,
    renderProps
  }
}

export const useNodeView = (
  nodeId: NodeId | undefined
): NodeView | undefined => {
  const editor = useEditorRuntime()
  const registry = useNodeRegistry()
  const view = useOptionalKeyedStoreValue(
    editor.read.node.render,
    nodeId,
    undefined
  )

  return useMemo(
    () => {
      if (!nodeId || !view) {
        return undefined
      }

      return resolveNodeViewState(editor, registry, view)
    },
    [editor, registry, nodeId, view]
  )
}

export const useNodeOverlayView = (
  nodeId: NodeId | undefined
): NodeOverlayView | undefined => {
  const editor = useEditorRuntime()
  const view = useOptionalKeyedStoreValue(
    editor.read.node.render,
    nodeId,
    undefined
  )

  return useMemo(
    () => {
      if (!nodeId || !view) {
        return undefined
      }

      return resolveNodeOverlayViewState(view)
    },
    [nodeId, view]
  )
}
