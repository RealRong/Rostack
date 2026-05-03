import type { NodeAlignMode } from '@whiteboard/core/node'
import {
  SegmentedButton,
  ToolbarIconButton
} from '@shared/ui'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BetweenHorizontalStart,
  BetweenVerticalStart
} from 'lucide-react'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

const ALIGN_OPTIONS = [
  { key: 'left' as const, title: 'Align left', icon: AlignStartVertical },
  { key: 'horizontal' as const, title: 'Align center', icon: AlignCenterVertical },
  { key: 'right' as const, title: 'Align right', icon: AlignEndVertical },
  { key: 'top' as const, title: 'Align top', icon: AlignStartHorizontal },
  { key: 'vertical' as const, title: 'Align middle', icon: AlignCenterHorizontal },
  { key: 'bottom' as const, title: 'Align bottom', icon: AlignEndHorizontal }
] satisfies readonly {
  key: NodeAlignMode
  title: string
  icon: typeof AlignStartVertical
}[]

const DISTRIBUTE_OPTIONS = [
  {
    key: 'horizontal' as const,
    title: 'Distribute horizontally',
    icon: BetweenVerticalStart
  },
  {
    key: 'vertical' as const,
    title: 'Distribute vertically',
    icon: BetweenHorizontalStart
  }
] as const

export const alignItem: ToolbarItemSpec = {
  key: 'align',
  panelKey: 'align',
  units: 1,
  renderButton: ({
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => (
    <ToolbarIconButton
      ref={(element) => {
        registerPanelButton('align', element)
      }}
      active={activePanelKey === 'align'}
      onClick={() => {
        togglePanel('align')
      }}
      title="Align and distribute"
      aria-label="Align and distribute"
    >
      <AlignStartVertical size={18} strokeWidth={1.9} />
    </ToolbarIconButton>
  ),
  renderPanel: ({
    activeScope,
    scopeCan,
    editor,
    closePanel
  }) => (
    <div className="flex items-stretch gap-0 p-2">
      <div className="grid grid-cols-3 gap-2">
        {ALIGN_OPTIONS.map((option) => {
          const Icon = option.icon

          return (
            <SegmentedButton
              key={option.key}
              active={false}
              className="h-10 w-10 flex-none px-0"
              title={option.title}
              aria-label={option.title}
              onClick={() => {
                closePanel()
                editor.actions.document.node.align(activeScope.target.nodeIds, option.key)
              }}
            >
              <Icon size={20} strokeWidth={1.8} />
            </SegmentedButton>
          )
        })}
      </div>
      <div
        className="mx-3 w-px self-stretch"
        style={{
          backgroundColor: 'var(--ui-border-subtle)'
        }}
      />
      <div className="flex flex-col gap-2">
        {DISTRIBUTE_OPTIONS.map((option) => {
          const Icon = option.icon

          return (
            <SegmentedButton
              key={option.key}
              active={false}
              disabled={!scopeCan.distribute}
              className="h-10 w-10 flex-none px-0"
              title={option.title}
              aria-label={option.title}
              onClick={() => {
                closePanel()
                editor.actions.document.node.distribute(activeScope.target.nodeIds, option.key)
              }}
            >
              <Icon size={20} strokeWidth={1.8} />
            </SegmentedButton>
          )
        })}
      </div>
    </div>
  )
}
