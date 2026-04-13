import type { NodeToolbarContext } from '@whiteboard/editor'
import type { WhiteboardRuntime } from '#whiteboard-react/types/runtime'
import type { ToolbarItemKey, ToolbarPanelKey } from '#whiteboard-react/features/selection/chrome/toolbar/types'
import { boldItem, italicItem } from '#whiteboard-react/features/selection/chrome/toolbar/items/textStyle'
import { fillItem } from '#whiteboard-react/features/selection/chrome/toolbar/items/fill'
import { filterItem } from '#whiteboard-react/features/selection/chrome/toolbar/items/filter'
import { fontSizeItem } from '#whiteboard-react/features/selection/chrome/toolbar/items/fontSize'
import { lockItem } from '#whiteboard-react/features/selection/chrome/toolbar/items/lock'
import { moreItem } from '#whiteboard-react/features/selection/chrome/toolbar/items/more'
import { shapeKindItem } from '#whiteboard-react/features/selection/chrome/toolbar/items/shapeKind'
import { strokeItem } from '#whiteboard-react/features/selection/chrome/toolbar/items/stroke'
import { textAlignItem } from '#whiteboard-react/features/selection/chrome/toolbar/items/textAlign'
import { textColorItem } from '#whiteboard-react/features/selection/chrome/toolbar/items/textColor'
import type { ToolbarItemSpec } from '#whiteboard-react/features/selection/chrome/toolbar/items/types'

const itemSpecs: Record<ToolbarItemKey, ToolbarItemSpec> = {
  filter: filterItem,
  'shape-kind': shapeKindItem,
  'font-size': fontSizeItem,
  bold: boldItem,
  italic: italicItem,
  'text-align': textAlignItem,
  'text-color': textColorItem,
  stroke: strokeItem,
  fill: fillItem,
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
  context: NodeToolbarContext
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
