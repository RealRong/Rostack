import type {
  SelectionToolbarContext,
  SelectionToolbarScope
} from '@whiteboard/editor'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'
import type { SelectionCan } from '@whiteboard/react/features/selection/capability'
import type { ToolbarItemKey, ToolbarPanelKey } from '@whiteboard/react/features/selection/chrome/toolbar/types'
import { alignItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/align'
import { edgeLineItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/edgeLine'
import { edgeMarkersItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/edgeMarkers'
import { edgeTextItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/edgeText'
import { boldItem, italicItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/textStyle'
import { fillItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/fill'
import { fontSizeItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/fontSize'
import { groupItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/group'
import { lockItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/lock'
import { moreItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/more'
import { shapeKindItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/shapeKind'
import { scopeItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/scope'
import { strokeItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/stroke'
import { textAlignItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/textAlign'
import { textColorItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/textColor'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

const itemSpecs: Record<ToolbarItemKey, ToolbarItemSpec> = {
  scope: scopeItem,
  align: alignItem,
  group: groupItem,
  'shape-kind': shapeKindItem,
  'font-size': fontSizeItem,
  bold: boldItem,
  italic: italicItem,
  'text-align': textAlignItem,
  'text-color': textColorItem,
  stroke: strokeItem,
  fill: fillItem,
  'edge-line': edgeLineItem,
  'edge-markers': edgeMarkersItem,
  'edge-text': edgeTextItem,
  lock: lockItem,
  more: moreItem
}

export const readToolbarItemSpec = (
  key: ToolbarItemKey
) => itemSpecs[key]

export const renderToolbarPanel = ({
  panelKey,
  context,
  activeScope,
  selectionCan,
  scopeCan,
  editor,
  closePanel,
  setActiveScope
}: {
  panelKey: ToolbarPanelKey | null
  context: SelectionToolbarContext
  activeScope: SelectionToolbarScope
  selectionCan: SelectionCan
  scopeCan: SelectionCan
  editor: WhiteboardRuntime
  closePanel: () => void
  setActiveScope: (key: string) => void
}) => {
  if (!panelKey) {
    return null
  }

  const spec = Object.values(itemSpecs).find((item) => item.panelKey === panelKey)
  return spec?.renderPanel?.({
    context,
    activeScope,
    selectionCan,
    scopeCan,
    editor,
    closePanel,
    setActiveScope
  }) ?? null
}
