import type { EdgePresetKey } from '@whiteboard/editor'
import { PickerOptionButton, PickerSection } from '@shared/ui'

type EdgeOption = {
  key: EdgePresetKey
  label: string
}

const EDGE_OPTIONS: readonly EdgeOption[] = [
  { key: 'edge.straight', label: 'Straight' },
  { key: 'edge.elbow', label: 'Elbow' },
  { key: 'edge.curve', label: 'Curve' }
] as const

export const EdgePresetGlyph = ({
  preset
}: {
  preset: EdgePresetKey
}) => {
  switch (preset) {
    case 'edge.elbow':
      return (
        <svg
          viewBox="0 0 32 24"
          aria-hidden="true"
          className="block h-6 w-8 overflow-visible fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1]"
        >
          <path d="M5 18H14V7H27" />
        </svg>
      )
    case 'edge.curve':
      return (
        <svg
          viewBox="0 0 32 24"
          aria-hidden="true"
          className="block h-6 w-8 overflow-visible fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1]"
        >
          <path d="M5 18C10 18 12 6 18 6C22 6 24 11 27 11" />
        </svg>
      )
    case 'edge.straight':
    default:
      return (
        <svg
          viewBox="0 0 32 24"
          aria-hidden="true"
          className="block h-6 w-8 overflow-visible fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1]"
        >
          <path d="M5 18 27 6" />
        </svg>
      )
  }
}

export const EdgeMenu = ({
  value,
  onChange
}: {
  value: EdgePresetKey
  onChange: (value: EdgePresetKey) => void
}) => (
  <PickerSection title="Edge">
    <div className="flex flex-col gap-1">
      {EDGE_OPTIONS.map((option) => (
        <PickerOptionButton
          key={option.key}
          type="button"
          className="min-h-10 gap-2.5"
          pressed={value === option.key}
          onClick={() => onChange(option.key)}
        >
          <span className="inline-flex h-6 w-8 items-center justify-center text-fg-muted">
            <EdgePresetGlyph preset={option.key} />
          </span>
          <span className="text-sm leading-5 text-fg">{option.label}</span>
        </PickerOptionButton>
      ))}
    </div>
  </PickerSection>
)
