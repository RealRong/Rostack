import { PickerGridButton, PickerSection } from '@shared/ui'
import {
  STICKY_FORMAT_OPTIONS,
  STICKY_TONE_OPTIONS,
  getStickyInsertPresetKey,
} from '@whiteboard/react/features/toolbox/presets'

const StickySwatch = ({
  fill,
  border,
  width,
  height
}: {
  fill: string
  border: string
  width: number
  height: number
}) => (
  <span className="inline-flex h-full w-full items-center justify-center">
    <span
      className="block rounded-[2px]"
      style={{
        width,
        height,
        background: fill,
        boxShadow: `inset 0 0 0 1px ${border}`
      }}
    />
  </span>
)

export const StickyMenu = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => {
  return (
    <div className="flex flex-col gap-5">
      {STICKY_FORMAT_OPTIONS.map((format) => {
        const title = format.key === 'square'
          ? 'Square (1:1)'
          : 'Rectangle (2:1)'
        const gridClassName = format.key === 'square'
          ? 'grid grid-cols-4 gap-2.5'
          : 'grid grid-cols-2 gap-2.5'
        const swatchClassName = format.key === 'square'
          ? 'aspect-square'
          : 'aspect-[2/1]'
        const previewWidth = format.key === 'square' ? 44 : 132
        const previewHeight = format.key === 'square' ? 44 : 76

        return (
          <PickerSection key={format.key} title={title}>
            <div className={gridClassName}>
              {STICKY_TONE_OPTIONS.map((tone) => {
                const presetKey = getStickyInsertPresetKey({
                  toneKey: tone.key,
                  formatKey: format.key
                })

                return (
                  <PickerGridButton
                    key={presetKey}
                    type="button"
                    className={`items-center justify-center rounded-[10px] p-0 ${swatchClassName}`}
                    pressed={value === presetKey}
                    onClick={() => onChange(presetKey)}
                    aria-label={`${title} ${tone.label}`}
                    title={tone.label}
                  >
                    <StickySwatch
                      fill={tone.fill}
                      border={tone.border}
                      width={previewWidth}
                      height={previewHeight}
                    />
                  </PickerGridButton>
                )
              })}
            </div>
          </PickerSection>
        )
      })}
    </div>
  )
}
