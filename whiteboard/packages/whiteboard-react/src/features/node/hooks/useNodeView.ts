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
  ReturnType<ReturnType<typeof useEditorRuntime>['scene']['nodes']['read']['get']>
>
const resolveNodeOverlayViewState = (
  view: RuntimeNodeView,
  capability: NonNullable<ReturnType<ReturnType<typeof useEditorRuntime>['scene']['nodes']['capability']['get']>>
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
  registry: Pick<NodeRegistry, 'get'>,
  baseView: RuntimeNodeView,
  capability: NonNullable<ReturnType<ReturnType<typeof useEditorRuntime>['scene']['nodes']['capability']['get']>>
): NodeView => {
  const definition = registry.get(baseView.node.type)
  const write: NodeWrite = {
    patch: (update: NodeUpdateInput) => {
      editor.write.node.patch([baseView.node.id], update)
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
  const transformStyle = buildNodeTransformStyle(
    baseView.rect,
    baseView.rotation,
    nodeStyle
  )

  return {
    nodeId: baseView.node.id,
    node: baseView.node,
    rect: baseView.rect,
    rotation: baseView.rotation,
    hidden: baseView.hidden,
    resizing: baseView.resizing,
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
    editor.scene.nodes.read,
    nodeId,
    undefined
  )

  return useMemo(
    () => {
      if (!nodeId || !view) {
        return undefined
      }

      const capability = editor.scene.nodes.capability.get(nodeId)
      if (!capability) {
        return undefined
      }

      return resolveNodeViewState(editor, registry, view, capability)
    },
    [editor, registry, nodeId, view]
  )
}

export const useNodeOverlayView = (
  nodeId: NodeId | undefined
): NodeOverlayView | undefined => {
  const editor = useEditorRuntime()
  const view = useOptionalKeyedStoreValue(
    editor.scene.nodes.read,
    nodeId,
    undefined
  )

  return useMemo(
    () => {
      if (!nodeId || !view) {
        return undefined
      }

      const capability = editor.scene.nodes.capability.get(nodeId)
      if (!capability) {
        return undefined
      }

      return resolveNodeOverlayViewState(view, capability)
    },
    [editor, nodeId, view]
  )
}
