import { ToolbarIconButton } from '@shared/ui'
import {
  AlignCenter,
  AlignLeft,
  AlignRight
} from 'lucide-react'
import { TextAlignPanel } from '@whiteboard/react/features/selection/chrome/panels/TextAlignPanel'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

const TEXT_ALIGN_OPTIONS = [
  { key: 'left' as const, icon: AlignLeft },
  { key: 'center' as const, icon: AlignCenter },
  { key: 'right' as const, icon: AlignRight }
] as const

export const textAlignItem: ToolbarItemSpec = {
  key: 'text-align',
  panelKey: 'text-align',
  renderButton: ({
    activeScope,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => {
    const node = activeScope.node
    if (!node) {
      return null
    }

    return (
      <ToolbarIconButton
        ref={(element) => {
          registerPanelButton('text-align', element)
        }}
        active={activePanelKey === 'text-align'}
        onClick={() => {
          togglePanel('text-align')
        }}
        title="Text align"
        aria-label="Text align"
      >
        {(() => {
          const Icon = TEXT_ALIGN_OPTIONS.find((option) => option.key === node.textAlign)?.icon ?? AlignLeft
          return <Icon size={18} strokeWidth={1.9} />
        })()}
      </ToolbarIconButton>
    )
  },
  renderPanel: ({
    activeScope,
    editor
  }) => {
    const node = activeScope.node
    if (!node) {
      return null
    }

    return (
      <TextAlignPanel
        value={node.textAlign}
        onChange={(value) => {
          editor.actions.node.text.align(node.nodeIds, value)
        }}
      />
    )
  }
}
