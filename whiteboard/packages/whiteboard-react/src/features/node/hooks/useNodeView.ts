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
  node: RuntimeNodeView['base']['node']
  rect: RuntimeNodeView['layout']['rect']
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
  ReturnType<ReturnType<typeof useEditorRuntime>['read']['node']['view']['get']>
>
type RuntimeNodeCapability = NonNullable<
  ReturnType<ReturnType<typeof useEditorRuntime>['read']['node']['capability']['get']>
>
const resolveNodeOverlayViewState = (
  view: RuntimeNodeView,
  capability: RuntimeNodeCapability
): NodeOverlayView => {
  return {
    nodeId: view.base.node.id,
    node: view.base.node,
    rect: view.layout.rect,
    transformFrameStyle: buildOverlayFrameStyle(view.layout.rect, view.layout.rotation),
    rotation: view.layout.rotation,
    canConnect: capability.connect,
    canResize: capability.resize,
    canRotate: capability.rotate
  }
}

const resolveNodeViewState = (
  editor: Pick<ReturnType<typeof useEditorRuntime>, 'actions'>,
  registry: Pick<NodeRegistry, 'get'>,
  baseView: RuntimeNodeView,
  capability: RuntimeNodeCapability
): NodeView => {
  const definition = registry.get(baseView.base.node.type)
  const write: NodeWrite = {
    patch: (update: NodeUpdateInput) => {
      editor.actions.node.patch([baseView.base.node.id], update)
    }
  }
  const renderProps: NodeRenderProps = {
    node: baseView.base.node,
    rect: baseView.layout.rect,
    rotation: baseView.layout.rotation,
    selected: baseView.render.selected,
    hovered: baseView.render.hovered,
    edit: baseView.render.edit,
    write
  }
  const nodeStyle = definition?.style
    ? definition.style(renderProps)
    : {}
  const transformStyle = buildNodeTransformStyle(
    baseView.layout.rect,
    baseView.layout.rotation,
    nodeStyle
  )

  return {
    nodeId: baseView.base.node.id,
    node: baseView.base.node,
    rect: baseView.layout.rect,
    rotation: baseView.layout.rotation,
    hidden: baseView.render.hidden,
    resizing: baseView.render.resizing,
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
  nodeId: NodeId | undefined
): NodeView | undefined => {
  const editor = useEditorRuntime()
  const registry = useNodeRegistry()
  const view = useOptionalKeyedStoreValue(
    editor.read.node.view,
    nodeId,
    undefined
  )
  const capability = useOptionalKeyedStoreValue(
    editor.read.node.capability,
    nodeId,
    undefined
  )

  return useMemo(
    () => {
      if (!nodeId || !view || !capability) {
        return undefined
      }

      return resolveNodeViewState(editor, registry, view, capability)
    },
    [editor, registry, nodeId, view, capability]
  )
}

export const useNodeOverlayView = (
  nodeId: NodeId | undefined
): NodeOverlayView | undefined => {
  const editor = useEditorRuntime()
  const view = useOptionalKeyedStoreValue(
    editor.read.node.view,
    nodeId,
    undefined
  )
  const capability = useOptionalKeyedStoreValue(
    editor.read.node.capability,
    nodeId,
    undefined
  )

  return useMemo(
    () => {
      if (!nodeId || !view || !capability) {
        return undefined
      }

      return resolveNodeOverlayViewState(view, capability)
    },
    [nodeId, view, capability]
  )
}
