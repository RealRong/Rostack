import { useEffect, useState } from 'react'
import {
  Chip,
  ChipRow,
  ColorSwatch,
  MenuSection
} from './MenuPrimitives'
import {
  COLORS,
  FONT_SIZES
} from './options'

export const TextMenu = ({
  value,
  color,
  fontSize,
  showText = false,
  showColor = false,
  showFontSize = false,
  onTextCommit,
  onColorChange,
  onFontSizeChange
}: {
  value: string
  color?: string
  fontSize?: number
  showText?: boolean
  showColor?: boolean
  showFontSize?: boolean
  onTextCommit?: (value: string) => void
  onColorChange?: (value: string) => void
  onFontSizeChange?: (value: number | undefined) => void
}) => {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = () => {
    if (!onTextCommit || draft === value) return
    onTextCommit(draft)
  }

  if (!showText && !showColor && !showFontSize) {
    return null
  }

  return (
    <>
      {showText ? (
        <MenuSection title="Text">
          <textarea
            className="wb-node-toolbar-textarea"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(value)
              }
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                commit()
              }
            }}
            data-selection-ignore
            data-input-ignore
          />
        </MenuSection>
      ) : null}
      {showColor && onColorChange ? (
        <MenuSection title="Color">
          <div className="wb-node-toolbar-swatch-grid">
            {COLORS.map((nextColor) => (
              <ColorSwatch
                key={nextColor}
                color={nextColor}
                active={color === nextColor}
                onClick={() => {
                  onColorChange(nextColor)
                }}
              />
            ))}
          </div>
        </MenuSection>
      ) : null}
      {showFontSize && onFontSizeChange ? (
        <MenuSection title="Size">
          <ChipRow>
            <Chip
              active={fontSize === undefined}
              onClick={() => {
                onFontSizeChange(undefined)
              }}
            >
              Auto
            </Chip>
            {FONT_SIZES.map((size) => (
              <Chip
                key={size}
                active={fontSize === size}
                onClick={() => {
                  onFontSizeChange(size)
                }}
              >
                {size}
              </Chip>
            ))}
          </ChipRow>
        </MenuSection>
      ) : null}
    </>
  )
}
