import { Button } from '@ui'
import {
  AlignCenter,
  AlignLeft,
  AlignRight
} from 'lucide-react'
import { TextAlignPanel } from '../../panels/TextAlignPanel'
import { preventToolbarPointerDown } from '../primitives'
import type { ToolbarItemSpec } from './types'
import { toNodeStylePatch } from '#react/features/node/update'

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
    <Button
      ref={(element) => {
        registerPanelButton('text-align', element)
      }}
      variant="ghost"
      pressed={activePanelKey === 'text-align'}
      className="h-9 w-9 rounded-xl p-0"
      onPointerDown={preventToolbarPointerDown}
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
    </Button>
  ),
  renderPanel: ({
    context,
    editor
  }) => {
    const node = context.primaryNode ?? context.nodes[0]

    return (
      <TextAlignPanel
      value={context.textAlign}
      onChange={(value) => {
        if (!node) {
          return
        }

        editor.actions.node.patch(context.nodeIds, toNodeStylePatch(node, {
          textAlign: value
        }))
      }}
      />
    )
  }
}
