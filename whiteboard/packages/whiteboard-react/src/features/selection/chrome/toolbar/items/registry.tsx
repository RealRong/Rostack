import type { WhiteboardRuntime } from '../../../../../types/runtime'
import type { ToolbarSummaryContext } from '../context'
import type { ToolbarItemKey, ToolbarPanelKey } from '../types'
import { boldItem, italicItem } from './textStyle'
import { fillItem } from './fill'
import { fontSizeItem } from './fontSize'
import { lockItem } from './lock'
import { moreItem } from './more'
import { shapeKindItem } from './shapeKind'
import { strokeItem } from './stroke'
import { textAlignItem } from './textAlign'
import { textColorItem } from './textColor'
import type { ToolbarItemSpec } from './types'

const itemSpecs: Record<ToolbarItemKey, ToolbarItemSpec> = {
  'shape-kind': shapeKindItem,
  'font-size': fontSizeItem,
  bold: boldItem,
  italic: italicItem,
  'text-align': textAlignItem,
  'text-color': textColorItem,
  stroke: strokeItem,
  fill: fillItem,
  align: {
    key: 'align',
    renderButton: () => null
  },
  distribute: {
    key: 'distribute',
    renderButton: () => null
  },
  order: {
    key: 'order',
    renderButton: () => null
  },
  group: {
    key: 'group',
    renderButton: () => null
  },
  lock: lockItem,
  more: moreItem
}

export const readToolbarItemSpec = (
  key: ToolbarItemKey
) => itemSpecs[key]

export const renderToolbarPanel = ({
  panelKey,
  context,
  editor,
  closePanel
}: {
  panelKey: ToolbarPanelKey | null
  context: ToolbarSummaryContext
  editor: WhiteboardRuntime
  closePanel: () => void
}) => {
  if (!panelKey) {
    return null
  }

  const spec = Object.values(itemSpecs).find((item) => item.panelKey === panelKey)
  return spec?.renderPanel?.({
    context,
    editor,
    closePanel
  }) ?? null
}
