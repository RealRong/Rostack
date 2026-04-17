import { Underline } from 'lucide-react'
import { ToolbarIconButton, ToolbarStrokeIcon } from '@shared/ui'
import { resolvePaletteColor } from '@whiteboard/react/features/palette'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'
import { MindmapBorderPanel, MindmapBranchPanel } from '@whiteboard/react/features/mindmap/ui/panels'

const MindmapBorderButtonGlyph = ({
  kind,
  stroke,
  fill,
  strokeWidth
}: {
  kind?: 'ellipse' | 'rect' | 'underline'
  stroke?: string
  fill?: string
  strokeWidth?: number
}) => {
  const resolvedStroke = resolvePaletteColor(stroke) ?? stroke
  const resolvedFill = resolvePaletteColor(fill) ?? fill

  if (kind === 'underline') {
    return (
      <div className="relative flex h-5 w-5 items-center justify-center">
        <Underline size={16} strokeWidth={1.9} />
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 rounded-full"
          style={{
            background: resolvedStroke ?? 'currentColor'
          }}
        />
      </div>
    )
  }

  if (kind === 'ellipse') {
    return (
      <svg viewBox="0 0 24 24" className="size-5" fill="none">
        <rect
          x={4}
          y={6}
          width={16}
          height={12}
          rx={6}
          fill={resolvedFill ?? 'transparent'}
          stroke={resolvedStroke ?? 'currentColor'}
          strokeWidth={strokeWidth ?? 2}
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none">
      <rect
        x={4}
        y={6}
        width={16}
        height={12}
        rx={2}
        fill={resolvedFill ?? 'transparent'}
        stroke={resolvedStroke ?? 'currentColor'}
        strokeWidth={strokeWidth ?? 2}
      />
    </svg>
  )
}

const mindmapBranchItem: ToolbarItemSpec = {
  key: 'mindmap-branch',
  panelKey: 'mindmap-branch',
  renderButton: ({
    activeScope,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => {
    const mindmap = activeScope.node?.mindmap
    if (!mindmap?.canEditBranch) {
      return null
    }

    return (
      <ToolbarIconButton
        ref={(element) => {
          registerPanelButton('mindmap-branch', element)
        }}
        active={activePanelKey === 'mindmap-branch'}
        onClick={() => {
          togglePanel('mindmap-branch')
        }}
        title="Branch style"
        aria-label="Branch style"
      >
        <ToolbarStrokeIcon
          stroke={resolvePaletteColor(mindmap.branchColor) ?? mindmap.branchColor}
          strokeWidth={mindmap.branchWidth}
        />
      </ToolbarIconButton>
    )
  },
  renderPanel: ({
    activeScope,
    editor
  }) => {
    const mindmap = activeScope.node?.mindmap
    if (!mindmap?.canEditBranch || !mindmap.treeId) {
      return null
    }

    return (
      <MindmapBranchPanel
        color={mindmap.branchColor}
        line={mindmap.branchLine}
        width={mindmap.branchWidth}
        stroke={mindmap.branchStroke}
        onColorChange={(value) => {
          editor.actions.mindmap.style.branch({
            id: mindmap.treeId!,
            nodeIds: mindmap.nodeIds,
            patch: {
              color: value
            },
            scope: 'subtree'
          })
        }}
        onLineChange={(value) => {
          editor.actions.mindmap.style.branch({
            id: mindmap.treeId!,
            nodeIds: mindmap.nodeIds,
            patch: {
              line: value
            },
            scope: 'subtree'
          })
        }}
        onWidthChange={(value) => {
          editor.actions.mindmap.style.branch({
            id: mindmap.treeId!,
            nodeIds: mindmap.nodeIds,
            patch: {
              width: value
            },
            scope: 'subtree'
          })
        }}
        onStrokeChange={(value) => {
          editor.actions.mindmap.style.branch({
            id: mindmap.treeId!,
            nodeIds: mindmap.nodeIds,
            patch: {
              stroke: value
            },
            scope: 'subtree'
          })
        }}
      />
    )
  }
}

const mindmapBorderItem: ToolbarItemSpec = {
  key: 'mindmap-border',
  panelKey: 'mindmap-border',
  renderButton: ({
    activeScope,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => {
    const node = activeScope.node
    const mindmap = node?.mindmap
    if (!node || !mindmap?.canEditBorder) {
      return null
    }

    return (
      <ToolbarIconButton
        ref={(element) => {
          registerPanelButton('mindmap-border', element)
        }}
        active={activePanelKey === 'mindmap-border'}
        onClick={() => {
          togglePanel('mindmap-border')
        }}
        title="Topic border"
        aria-label="Topic border"
      >
        <MindmapBorderButtonGlyph
          kind={mindmap.borderKind}
          stroke={node.stroke}
          fill={node.fill}
          strokeWidth={node.strokeWidth}
        />
      </ToolbarIconButton>
    )
  },
  renderPanel: ({
    activeScope,
    editor
  }) => {
    const node = activeScope.node
    const mindmap = node?.mindmap
    if (!node || !mindmap?.canEditBorder) {
      return null
    }

    return (
      <MindmapBorderPanel
        kind={mindmap.borderKind}
        stroke={node.stroke}
        strokeWidth={node.strokeWidth}
        fill={node.fill}
        onKindChange={(value) => {
          editor.actions.mindmap.style.topic({
            nodeIds: node.nodeIds,
            patch: {
              frameKind: value
            }
          })
        }}
        onStrokeChange={(value) => {
          editor.actions.mindmap.style.topic({
            nodeIds: node.nodeIds,
            patch: {
              stroke: value
            }
          })
        }}
        onStrokeWidthChange={(value) => {
          editor.actions.mindmap.style.topic({
            nodeIds: node.nodeIds,
            patch: {
              strokeWidth: value
            }
          })
        }}
        onFillChange={(value) => {
          editor.actions.mindmap.style.topic({
            nodeIds: node.nodeIds,
            patch: {
              fill: value
            }
          })
        }}
      />
    )
  }
}

type MindmapToolbarItemKey =
  | 'mindmap-branch'
  | 'mindmap-border'

export const mindmapToolbarItemSpecs: Record<MindmapToolbarItemKey, ToolbarItemSpec> = {
  'mindmap-branch': mindmapBranchItem,
  'mindmap-border': mindmapBorderItem
}
