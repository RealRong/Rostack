import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@ui/button'
import {
  resolveOptionDotStyle,
  resolveOptionColorToken
} from '@ui/color'
import { Input } from '@ui/input'
import { meta, renderMessage } from '@dataview/meta'
import type { OptionLike } from './OptionEditorPopover'

export interface OptionEditorPanelProps {
  option: OptionLike
  onRename: (name: string) => boolean | void
  onColorChange: (color: string) => void
  onDelete?: () => void
  onRequestClose?: () => void
}

export const OptionEditorPanel = (props: OptionEditorPanelProps) => {
  const [draftName, setDraftName] = useState(props.option.name)

  useEffect(() => {
    setDraftName(props.option.name)
  }, [props.option.id, props.option.name])

  const commitName = () => {
    const nextName = draftName.trim()
    if (!nextName) {
      setDraftName(props.option.name)
      return
    }

    if (nextName === props.option.name) {
      setDraftName(nextName)
      return
    }

    const result = props.onRename(nextName)
    if (result === false) {
      setDraftName(props.option.name)
      return
    }

    setDraftName(nextName)
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={draftName}
        onChange={event => setDraftName(event.target.value)}
        onBlur={commitName}
        onKeyDown={event => {
          event.stopPropagation()

          if (event.key !== 'Enter') {
            return
          }

          event.preventDefault()
          commitName()
        }}
        placeholder={renderMessage(meta.ui.field.options.namePlaceholder)}
      />

      <div className="flex flex-col gap-0.5">
        {meta.option.color.list.map(color => {
          const active = (props.option.color ?? '') === color.id

          return (
            <Button
              key={color.id || 'default'}
              onClick={() => props.onColorChange(color.id)}
              layout="row"
              leading={(
                <span
                  className="inline-flex h-3 w-3 shrink-0 rounded-full border"
                  style={{
                    ...resolveOptionDotStyle(color.id),
                    borderColor: resolveOptionColorToken(color.id, 'badge-border')
                  }}
                />
              )}
              trailing={active
                ? <Check className="size-4 text-foreground" size={16} strokeWidth={1.8} />
                : undefined}
              pressed={active}
            >
              {renderMessage(color.message)}
            </Button>
          )
        })}
      </div>

      {props.onDelete ? (
        <div className="border-t border-divider pt-1.5">
          <Button
            variant="ghostDestructive"
            layout="row"
            onClick={() => {
              props.onDelete?.()
              props.onRequestClose?.()
            }}
          >
            {renderMessage(meta.ui.field.options.remove)}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
