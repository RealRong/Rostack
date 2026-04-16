import { ToolbarIconButton } from '@shared/ui'
import {
  ArrowLeftRight,
  MessageSquarePlus
} from 'lucide-react'
import { WHITEBOARD_LINE_DEFAULT_COLOR } from '@whiteboard/core/node'
import type { EdgeMarker, EdgeTextMode } from '@whiteboard/core/types'
import { resolvePaletteColor } from '@whiteboard/react/features/palette'
import type {
  ToolbarItemSpec
} from '@whiteboard/react/features/selection/chrome/toolbar/items/types'
import type {
  ToolbarRecipeItem
} from '@whiteboard/react/features/selection/chrome/toolbar/types'
import { EDGE_UI } from '@whiteboard/react/features/edge/ui/catalog'
import {
  EdgeLineGlyph,
  EdgeMarkerGlyph
} from '@whiteboard/react/features/edge/ui/glyphs'
import {
  EdgeGeometryPanel,
  EdgeMarkerPanel,
  EdgeStrokePanel
} from '@whiteboard/react/features/edge/ui/panels'

const readActiveTextMode = (
  value: EdgeTextMode | undefined
) => value === 'tangent'
  ? 'tangent'
  : 'horizontal'

const readNextTextMode = (
  value: EdgeTextMode | undefined
) => readActiveTextMode(value) === 'tangent'
  ? 'horizontal'
  : 'tangent'

const createMarkerItem = (
  side: 'start' | 'end'
): ToolbarItemSpec => {
  const key = side === 'start'
    ? 'edge-marker-start'
    : 'edge-marker-end'

  return {
    key,
    panelKey: key,
    renderButton: ({
      activeScope,
      activePanelKey,
      togglePanel,
      registerPanelButton
    }) => {
      const edge = activeScope.edge
      if (!edge) {
        return null
      }

      return (
        <ToolbarIconButton
          ref={(element) => {
            registerPanelButton(key, element)
          }}
          active={activePanelKey === key}
          onClick={() => {
            togglePanel(key)
          }}
          title={side === 'start' ? 'Line start' : 'Line end'}
          aria-label={side === 'start' ? 'Line start' : 'Line end'}
        >
          <EdgeMarkerGlyph
            marker={(side === 'start' ? edge.start : edge.end) as EdgeMarker | undefined}
            side={side}
          />
        </ToolbarIconButton>
      )
    },
    renderPanel: ({
      activeScope,
      editor
    }) => {
      const edge = activeScope.edge
      if (!edge) {
        return null
      }

      return (
        <EdgeMarkerPanel
          side={side}
          value={side === 'start' ? edge.start : edge.end}
          onChange={(value) => {
            if (side === 'start') {
              editor.actions.edge.style.start(edge.edgeIds, value)
              return
            }

            editor.actions.edge.style.end(edge.edgeIds, value)
          }}
        />
      )
    }
  }
}

const edgeStrokeItem: ToolbarItemSpec = {
  key: 'edge-stroke',
  panelKey: 'edge-stroke',
  renderButton: ({
    activeScope,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => {
    const edge = activeScope.edge
    if (!edge) {
      return null
    }

    return (
      <ToolbarIconButton
        ref={(element) => {
          registerPanelButton('edge-stroke', element)
        }}
        active={activePanelKey === 'edge-stroke'}
        onClick={() => {
          togglePanel('edge-stroke')
        }}
        title="Line color and opacity"
        aria-label="Line color and opacity"
      >
        <EdgeLineGlyph
          type="straight"
          color={edge.color ?? WHITEBOARD_LINE_DEFAULT_COLOR}
          opacity={edge.opacity}
        />
      </ToolbarIconButton>
    )
  },
  renderPanel: ({
    activeScope,
    editor
  }) => {
    const edge = activeScope.edge
    if (!edge) {
      return null
    }

    return (
      <EdgeStrokePanel
        color={edge.color}
        opacity={edge.opacity}
        onColorChange={(value) => {
          editor.actions.edge.style.color(edge.edgeIds, value)
        }}
        onOpacityChange={(value) => {
          editor.actions.edge.style.opacity(edge.edgeIds, value)
        }}
      />
    )
  }
}

const edgeGeometryItem: ToolbarItemSpec = {
  key: 'edge-geometry',
  panelKey: 'edge-geometry',
  renderButton: ({
    activeScope,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => {
    const edge = activeScope.edge
    if (!edge) {
      return null
    }

    return (
      <ToolbarIconButton
        ref={(element) => {
          registerPanelButton('edge-geometry', element)
        }}
        active={activePanelKey === 'edge-geometry'}
        onClick={() => {
          togglePanel('edge-geometry')
        }}
        title="Line type, style, and width"
        aria-label="Line type, style, and width"
      >
        <EdgeLineGlyph
          type={edge.type}
          dash={edge.dash}
          color={resolvePaletteColor(edge.color) ?? edge.color ?? WHITEBOARD_LINE_DEFAULT_COLOR}
        />
      </ToolbarIconButton>
    )
  },
  renderPanel: ({
    activeScope,
    editor
  }) => {
    const edge = activeScope.edge
    if (!edge) {
      return null
    }

    return (
      <EdgeGeometryPanel
        type={edge.type}
        dash={edge.dash}
        width={edge.width}
        onTypeChange={(value) => {
          editor.actions.edge.type.set(edge.edgeIds, value)
        }}
        onDashChange={(value) => {
          editor.actions.edge.style.dash(edge.edgeIds, value)
        }}
        onWidthChange={(value) => {
          editor.actions.edge.style.width(edge.edgeIds, value)
        }}
      />
    )
  }
}

const edgeMarkerSwapItem: ToolbarItemSpec = {
  key: 'edge-marker-swap',
  renderButton: ({
    activeScope,
    editor
  }) => {
    const edge = activeScope.edge
    if (!edge) {
      return null
    }

    return (
      <ToolbarIconButton
        onClick={() => {
          editor.actions.edge.style.swapMarkers(edge.edgeIds)
        }}
        title="Swap markers"
        aria-label="Swap markers"
      >
        <ArrowLeftRight size={18} strokeWidth={1.9} />
      </ToolbarIconButton>
    )
  }
}

const edgeAddLabelItem: ToolbarItemSpec = {
  key: 'edge-add-label',
  renderButton: ({
    activeScope,
    editor
  }) => {
    const edge = activeScope.edge
    if (!edge) {
      return null
    }

    return (
      <ToolbarIconButton
        onClick={() => {
          if (edge.primaryEdgeId) {
            editor.actions.edge.label.add(edge.primaryEdgeId)
          }
        }}
        title="Add label"
        aria-label="Add label"
      >
        <MessageSquarePlus size={18} strokeWidth={1.9} />
      </ToolbarIconButton>
    )
  }
}

const edgeTextModeItem: ToolbarItemSpec = {
  key: 'edge-text-mode',
  renderButton: ({
    activeScope,
    editor
  }) => {
    const edge = activeScope.edge
    if (!edge) {
      return null
    }

    const activeTextMode = readActiveTextMode(edge.textMode)
    const nextTextMode = readNextTextMode(edge.textMode)
    const option = EDGE_UI.textModes.find((entry) => entry.value === activeTextMode)!
    const Glyph = option.glyph

    return (
      <ToolbarIconButton
        active={activeTextMode === 'tangent'}
        onClick={() => {
          editor.actions.edge.textMode.set(edge.edgeIds, nextTextMode)
        }}
        title={activeTextMode === 'tangent'
          ? 'Use horizontal labels'
          : 'Use tangent labels'}
        aria-label={activeTextMode === 'tangent'
          ? 'Use horizontal labels'
          : 'Use tangent labels'}
      >
        <Glyph className="size-6" />
      </ToolbarIconButton>
    )
  }
}

type EdgeToolbarItemKey =
  | 'edge-stroke'
  | 'edge-geometry'
  | 'edge-marker-start'
  | 'edge-marker-swap'
  | 'edge-marker-end'
  | 'edge-add-label'
  | 'edge-text-mode'

export const EDGE_TOOLBAR_RECIPE: readonly ToolbarRecipeItem[] = [
  { kind: 'item', key: 'edge-stroke' },
  { kind: 'item', key: 'edge-geometry' },
  { kind: 'divider' },
  { kind: 'item', key: 'edge-marker-start' },
  { kind: 'item', key: 'edge-marker-swap' },
  { kind: 'item', key: 'edge-marker-end' },
  { kind: 'divider' },
  { kind: 'item', key: 'edge-add-label' },
  { kind: 'item', key: 'edge-text-mode' },
  { kind: 'divider' },
  { kind: 'item', key: 'lock' },
  { kind: 'item', key: 'more' }
] as const

export const edgeToolbarItemSpecs: Record<EdgeToolbarItemKey, ToolbarItemSpec> = {
  'edge-stroke': edgeStrokeItem,
  'edge-geometry': edgeGeometryItem,
  'edge-marker-start': createMarkerItem('start'),
  'edge-marker-swap': edgeMarkerSwapItem,
  'edge-marker-end': createMarkerItem('end'),
  'edge-add-label': edgeAddLabelItem,
  'edge-text-mode': edgeTextModeItem
}
