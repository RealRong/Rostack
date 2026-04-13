import { ToolbarIconButton } from '@rostack/ui'
import {
  AlignCenter,
  AlignLeft,
  AlignRight
} from 'lucide-react'
import { TextAlignPanel } from '../../panels/TextAlignPanel'
import type { ToolbarItemSpec } from './types'

const TEXT_ALIGN_OPTIONS = [
  { key: 'left' as const, icon: AlignLeft },
  { key: 'center' as const, icon: AlignCenter },
  { key: 'right' as const, icon: AlignRight }
] as const

export const textAlignItem: ToolbarItemSpec = {
  key: 'text-align',
  panelKey: 'text-align',
  renderButton: ({
    context,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => (
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
        const Icon = TEXT_ALIGN_OPTIONS.find((option) => option.key === context.textAlign)?.icon ?? AlignLeft
        return <Icon size={18} strokeWidth={1.9} />
      })()}
    </ToolbarIconButton>
  ),
  renderPanel: ({
    context,
    editor
  }) => (
    <TextAlignPanel
      value={context.textAlign}
      onChange={(value) => {
        editor.actions.node.text.align(context.nodeIds, value)
      }}
    />
  )
}
