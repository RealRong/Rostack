import { Button, Panel } from '@rostack/ui'

const FONT_SIZE_PRESETS = [10, 12, 14, 18, 24, 36, 48, 64, 80, 144, 288] as const

export const FontSizePanel = ({
  value,
  onChange
}: {
  value?: number
  onChange: (value: number) => void
}) => {
  return (
    <Panel className="w-20 min-w-[5rem] gap-1 p-2">
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
    </Panel>
  )
}
