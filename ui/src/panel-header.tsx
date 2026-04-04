import { ArrowLeft } from 'lucide-react'
import { Button } from './button'

export interface PanelHeaderProps {
  title: string
  onBack?: () => void
}

export const PanelHeader = (props: PanelHeaderProps) => {
  return (
    <div className="flex items-center gap-2 border-b border-divider px-2.5 py-2">
      {props.onBack ? (
        <Button
          aria-label="Back"
          onClick={props.onBack}
          size="icon"
        >
          <ArrowLeft className="size-4 text-muted-foreground" size={16} strokeWidth={1.9} />
        </Button>
      ) : (
        null
      )}

      <div className="min-w-0 flex-1 truncate text-sm font-semibold">
        {props.title}
      </div>

      <div className="w-6 shrink-0" />
    </div>
  )
}
