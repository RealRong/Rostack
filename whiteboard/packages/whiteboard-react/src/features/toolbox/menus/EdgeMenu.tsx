import type { EdgePresetKey } from '@whiteboard/editor'
import { MenuSection } from '../../selection/chrome/menus/MenuPrimitives'

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
          className="wb-left-toolbar-edge-glyph"
        >
          <path d="M5 18H14V7H27" />
        </svg>
      )
    case 'edge.curve':
      return (
        <svg
          viewBox="0 0 32 24"
          aria-hidden="true"
          className="wb-left-toolbar-edge-glyph"
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
          className="wb-left-toolbar-edge-glyph"
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
  <MenuSection title="Edge">
    <div className="wb-left-toolbar-edge-list">
      {EDGE_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          className="wb-left-toolbar-edge-option"
          data-active={value === option.key ? 'true' : undefined}
          onClick={() => onChange(option.key)}
          data-selection-ignore
          data-input-ignore
        >
          <span className="wb-left-toolbar-edge-option-preview">
            <EdgePresetGlyph preset={option.key} />
          </span>
          <span className="wb-left-toolbar-edge-option-label">{option.label}</span>
        </button>
      ))}
    </div>
  </MenuSection>
)
