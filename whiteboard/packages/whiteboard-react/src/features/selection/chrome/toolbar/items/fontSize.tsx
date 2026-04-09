import type { NodeId, Size } from '@whiteboard/core/types'
import { FontSizePanel } from '../../panels/FontSizePanel'
import { measureBoundTextNodeSize } from '#react/features/node'
import { FontSizeControl } from './shared/FontSizeControl'
import type { ToolbarItemSpec } from './types'

const buildTextSizeById = ({
  context,
  editor,
  value
}: {
  context: Parameters<NonNullable<ToolbarItemSpec['renderButton']>>[0]['context']
  editor: Parameters<NonNullable<ToolbarItemSpec['renderButton']>>[0]['editor']
  value?: number
}) => {
  const sizeById: Record<NodeId, Size> = {}

  context.nodes.forEach((node) => {
    if (node.type !== 'text') {
      return
    }

    const nextSize = measureBoundTextNodeSize({
      editor,
      nodeId: node.id,
      value: typeof node.data?.text === 'string' ? node.data.text : '',
      fontSize: value
    })
    if (!nextSize) {
      return
    }

    sizeById[node.id] = nextSize
  })

  return Object.keys(sizeById).length > 0
    ? sizeById
    : undefined
}

export const fontSizeItem: ToolbarItemSpec = {
  key: 'font-size',
  panelKey: 'font-size',
  units: 2,
  renderButton: ({
    context,
    editor,
    togglePanel,
    registerPanelButton
  }) => (
    <FontSizeControl
      value={context.fontSize}
      registerAnchor={(element) => {
        registerPanelButton('font-size', element)
      }}
      onTogglePanel={() => {
        togglePanel('font-size')
      }}
      onCommit={(value) => {
        editor.actions.document.nodes.text.set({
          nodeIds: context.nodeIds,
          patch: {
            size: value
          },
          sizeById: buildTextSizeById({
            context,
            editor,
            value
          })
        })
      }}
    />
  ),
  renderPanel: ({
    context,
    editor,
    closePanel
  }) => (
    <FontSizePanel
      value={context.fontSize}
      onChange={(value) => {
        closePanel()
        editor.actions.document.nodes.text.set({
          nodeIds: context.nodeIds,
          patch: {
            size: value
          },
          sizeById: buildTextSizeById({
            context,
            editor,
            value
          })
        })
      }}
    />
  )
}
