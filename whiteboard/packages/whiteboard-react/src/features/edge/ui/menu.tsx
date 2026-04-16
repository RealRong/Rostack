import type {
  EdgePresetKey
} from '@whiteboard/editor'
import { PickerOptionButton } from '@shared/ui'
import { EDGE_UI } from '@whiteboard/react/features/edge/ui/catalog'

export const EdgePresetGlyph = ({
  preset,
  className = 'block size-8 overflow-visible'
}: {
  preset: EdgePresetKey
  className?: string
}) => {
  const option = EDGE_UI.presets.find((entry) => entry.key === preset)!
  const Glyph = option.glyph

  return (
    <Glyph
      aria-hidden="true"
      className={className}
    />
  )
}

export const EdgeMenu = ({
  value,
  onChange
}: {
  value: EdgePresetKey
  onChange: (value: EdgePresetKey) => void
}) => (
  <div className="flex flex-col gap-1">
    {EDGE_UI.presets.map((option) => {
      const Glyph = option.glyph

      return (
        <PickerOptionButton
          key={option.key}
          type="button"
          className="p-1"
          pressed={value === option.key}
          title={option.label}
          aria-label={option.label}
          onClick={() => onChange(option.key)}
        >
          <Glyph
            aria-hidden="true"
            className="block size-8 overflow-visible"
          />
        </PickerOptionButton>
      )
    })}
  </div>
)
