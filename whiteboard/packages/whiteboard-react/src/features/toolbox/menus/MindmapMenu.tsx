import { PickerOptionButton, PickerSection } from '@shared/ui'
import {
  MINDMAP_INSERT_PRESETS,
  MINDMAP_INSERT_TEMPLATES
} from '../presets'

const MindmapTemplatePreview = ({
  templateKey
}: {
  templateKey: string
}) => {
  const template = MINDMAP_INSERT_TEMPLATES.find((item) => item.key === templateKey)
  const children = template?.children ?? []

  return (
    <svg
      viewBox="0 0 72 48"
      aria-hidden="true"
      className="block h-10 w-16"
    >
      <rect
        x="26"
        y="17"
        width="20"
        height="14"
        rx="7"
        fill="var(--ui-yellow-surface)"
        stroke="currentColor"
        strokeWidth="1"
      />
      {children.slice(0, 4).map((child, index) => {
        const left = child.side === 'left'
        const y = 8 + index * 10
        const targetX = left ? 8 : 52
        const lineStartX = left ? 26 : 46
        const lineEndX = left ? 20 : 52
        return (
          <g key={`${templateKey}:${index}`}>
            <path
              d={`M${lineStartX} 24 C${left ? 22 : 50} 24, ${left ? 18 : 54} ${y + 4}, ${lineEndX} ${y + 4}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.75"
            />
            <rect
              x={targetX}
              y={y}
              width="12"
              height="8"
              rx="4"
              fill="var(--ui-surface)"
              stroke="currentColor"
              strokeWidth="1"
            />
          </g>
        )
      })}
    </svg>
  )
}

export const MindmapMenu = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => (
  <PickerSection title="Mindmap">
    <div className="flex flex-col gap-1">
      {MINDMAP_INSERT_PRESETS.map((preset) => (
        <PickerOptionButton
          key={preset.key}
          type="button"
          className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2.5 px-2.5 py-2"
          pressed={value === preset.key}
          onClick={() => onChange(preset.key)}
        >
          <span className="inline-flex h-12 w-[72px] items-center justify-center rounded-lg bg-surface-subtle text-fg-muted">
            <MindmapTemplatePreview templateKey={preset.key} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm leading-5 text-fg">{preset.label}</span>
            <span className="text-xs leading-4 text-fg-muted">{preset.description}</span>
          </span>
        </PickerOptionButton>
      ))}
    </div>
  </PickerSection>
)
