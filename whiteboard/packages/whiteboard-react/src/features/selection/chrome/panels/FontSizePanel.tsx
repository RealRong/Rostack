import { Button, Panel } from '@shared/ui'

const FONT_SIZE_PRESETS = [10, 12, 14, 18, 24, 36, 48, 64, 80, 144, 288] as const

export const FontSizePanel = ({
  value,
  onChange
}: {
  value?: number
  onChange: (value: number) => void
}) => {
  return (
    <div className="w-20 flex flex-col gap-1">
      {FONT_SIZE_PRESETS.map((preset) => (
        <Button
          key={preset}
          variant="ghost"
          pressed={value === preset}
          className="font-medium"
          onClick={() => onChange(preset)}
        >
          {preset}
        </Button>
      ))}
    </div>
  )
}
