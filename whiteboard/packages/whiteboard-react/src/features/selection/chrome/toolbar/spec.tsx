import {
  createOneToOneIndex,
  createTableIndex
} from '@shared/spec'
import type { ReactNode } from 'react'
import type {
  SelectionToolbarContext,
  SelectionToolbarScope
} from '@whiteboard/editor'
import type { SelectionCan } from '@whiteboard/react/features/selection/capability'
import { edgeToolbarItemSpecs } from '@whiteboard/react/features/edge/ui/toolbar'
import { mindmapToolbarItemSpecs } from '@whiteboard/react/features/mindmap/ui/toolbar'
import { alignItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/align'
import { boldItem, italicItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/textStyle'
import { fillItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/fill'
import { fontSizeItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/fontSize'
import { groupItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/group'
import { lockItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/lock'
import { moreItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/more'
import { scopeItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/scope'
import { shapeKindItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/shapeKind'
import { strokeItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/stroke'
import { textAlignItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/textAlign'
import { textColorItem } from '@whiteboard/react/features/selection/chrome/toolbar/items/textColor'
import type {
  ToolbarItemKey,
  ToolbarPanelKey
} from '@whiteboard/react/features/selection/chrome/toolbar/types'
import type {
  ToolbarButtonRendererProps,
  ToolbarItemSpec,
  ToolbarPanelRendererProps
} from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

type ToolbarVisibilityInput = {
  context: SelectionToolbarContext
  activeScope: SelectionToolbarScope
  selectionCan: SelectionCan
  scopeCan: SelectionCan
}

type ToolbarPanelSpec = {
  itemKey: ToolbarItemKey
  render: (props: ToolbarPanelRendererProps) => ReactNode
}

const items = {
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
  lock: lockItem,
  more: moreItem,
  ...mindmapToolbarItemSpecs,
  ...edgeToolbarItemSpecs
} satisfies Record<ToolbarItemKey, ToolbarItemSpec>

const panels = {
  scope: {
    itemKey: 'scope',
    render: scopeItem.renderPanel!
  },
  align: {
    itemKey: 'align',
    render: alignItem.renderPanel!
  },
  'shape-kind': {
    itemKey: 'shape-kind',
    render: shapeKindItem.renderPanel!
  },
  'font-size': {
    itemKey: 'font-size',
    render: fontSizeItem.renderPanel!
  },
  'text-align': {
    itemKey: 'text-align',
    render: textAlignItem.renderPanel!
  },
  'text-color': {
    itemKey: 'text-color',
    render: textColorItem.renderPanel!
  },
  stroke: {
    itemKey: 'stroke',
    render: strokeItem.renderPanel!
  },
  fill: {
    itemKey: 'fill',
    render: fillItem.renderPanel!
  },
  'mindmap-branch': {
    itemKey: 'mindmap-branch',
    render: mindmapToolbarItemSpecs['mindmap-branch'].renderPanel!
  },
  'mindmap-border': {
    itemKey: 'mindmap-border',
    render: mindmapToolbarItemSpecs['mindmap-border'].renderPanel!
  },
  'edge-stroke': {
    itemKey: 'edge-stroke',
    render: edgeToolbarItemSpecs['edge-stroke'].renderPanel!
  },
  'edge-geometry': {
    itemKey: 'edge-geometry',
    render: edgeToolbarItemSpecs['edge-geometry'].renderPanel!
  },
  'edge-marker-start': {
    itemKey: 'edge-marker-start',
    render: edgeToolbarItemSpecs['edge-marker-start'].renderPanel!
  },
  'edge-marker-end': {
    itemKey: 'edge-marker-end',
    render: edgeToolbarItemSpecs['edge-marker-end'].renderPanel!
  },
  more: {
    itemKey: 'more',
    render: moreItem.renderPanel!
  }
} satisfies Record<ToolbarPanelKey, ToolbarPanelSpec>

export const toolbarSpec = {
  items,
  panels,
  layouts: {
    node: [
      ['scope'],
      ['align', 'group'],
      ['shape-kind', 'font-size', 'bold', 'italic', 'text-align', 'text-color', 'stroke', 'fill'],
      ['mindmap-branch', 'mindmap-border'],
      ['lock', 'more']
    ],
    edge: [
      ['edge-stroke', 'edge-geometry'],
      ['edge-marker-start', 'edge-marker-swap', 'edge-marker-end'],
      ['edge-add-label', 'edge-text-mode'],
      ['lock', 'more']
    ]
  },
  visibility: {
    scope: ({ context }: ToolbarVisibilityInput) => context.scopes.length > 1,
    align: ({ activeScope, scopeCan }: ToolbarVisibilityInput) => Boolean(activeScope.node) && scopeCan.align,
    group: ({ selectionCan }: ToolbarVisibilityInput) => selectionCan.makeGroup || selectionCan.ungroup,
    'shape-kind': ({ activeScope }: ToolbarVisibilityInput) => activeScope.node?.canChangeShapeKind ?? false,
    'font-size': ({ activeScope }: ToolbarVisibilityInput) => activeScope.node?.canEditFontSize ?? false,
    bold: ({ activeScope }: ToolbarVisibilityInput) => activeScope.node?.canEditFontWeight ?? false,
    italic: ({ activeScope }: ToolbarVisibilityInput) => activeScope.node?.canEditFontStyle ?? false,
    'text-align': ({ activeScope }: ToolbarVisibilityInput) => activeScope.node?.canEditTextAlign ?? false,
    'text-color': ({ activeScope }: ToolbarVisibilityInput) => activeScope.node?.canEditTextColor ?? false,
    stroke: ({ activeScope }: ToolbarVisibilityInput) => activeScope.node?.canEditStroke ?? false,
    fill: ({ activeScope }: ToolbarVisibilityInput) => activeScope.node?.canEditFill ?? false,
    'mindmap-branch': ({ activeScope }: ToolbarVisibilityInput) => activeScope.node?.mindmap?.canEditBranch ?? false,
    'mindmap-border': ({ activeScope }: ToolbarVisibilityInput) => activeScope.node?.mindmap?.canEditBorder ?? false,
    'edge-stroke': ({ activeScope }: ToolbarVisibilityInput) => Boolean(activeScope.edge),
    'edge-geometry': ({ activeScope }: ToolbarVisibilityInput) => Boolean(activeScope.edge),
    'edge-marker-start': ({ activeScope }: ToolbarVisibilityInput) => Boolean(activeScope.edge),
    'edge-marker-swap': ({ activeScope }: ToolbarVisibilityInput) => Boolean(activeScope.edge?.single),
    'edge-marker-end': ({ activeScope }: ToolbarVisibilityInput) => Boolean(activeScope.edge),
    'edge-add-label': ({ activeScope }: ToolbarVisibilityInput) => Boolean(activeScope.edge?.single),
    'edge-text-mode': ({ activeScope }: ToolbarVisibilityInput) => Boolean(activeScope.edge),
    lock: ({ activeScope }: ToolbarVisibilityInput) => Boolean(activeScope.node || activeScope.edge),
    more: ({ context }: ToolbarVisibilityInput) => context.target.nodeIds.length + context.target.edgeIds.length > 0
  }
} as const

const itemByKey = createTableIndex(toolbarSpec.items)
const panelByKey = createTableIndex(toolbarSpec.panels, {
  fallback: () => undefined
})
const itemKeyByPanelKey = createOneToOneIndex(
  toolbarSpec.panels,
  ({
    key
  }) => key
)

export const compiledToolbarSpec = {
  itemByKey,
  panelByKey,
  itemKeyByPanelKey,
  layoutByTarget: toolbarSpec.layouts,
  visibilityByItemKey: toolbarSpec.visibility
} as const
