import { Panel, PanelSection, SegmentedButton } from '@shared/ui'
import {
  AlignCenter,
  AlignLeft,
  AlignRight
} from 'lucide-react'

const TEXT_ALIGN_OPTIONS = [
  { key: 'left' as const, title: 'Align left', icon: AlignLeft },
  { key: 'center' as const, title: 'Align center', icon: AlignCenter },
  { key: 'right' as const, title: 'Align right', icon: AlignRight }
] as const

export const TextAlignPanel = ({
  value,
  onChange
}: {
  value?: 'left' | 'center' | 'right'
  onChange: (value: 'left' | 'center' | 'right') => void
}) => (
  <div className="flex items-center gap-1.5">
    {TEXT_ALIGN_OPTIONS.map((option) => {
      const Icon = option.icon
      return (
        <SegmentedButton
          key={option.key}
          active={value === option.key}
          onClick={() => onChange(option.key)}
        >
          <Icon size={18} strokeWidth={1.9} />
        </SegmentedButton>
      )
    })}
  </div>
)
