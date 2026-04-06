import { Check } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import { Button } from '@ui/button'
import {
  resolveOptionDotStyle,
  resolveOptionColorToken
} from '@ui/color'
import { Input } from '@ui/input'
import { Popover } from '@ui/popover'
import { meta, renderMessage } from '@dataview/meta'

export interface OptionLike {
  id: string
  name: string
  color?: string
}

export interface OptionEditorPopoverProps {
  option: OptionLike
  open: boolean
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => boolean | void
  onColorChange: (color: string) => void
  onDelete?: () => void
  trigger: ReactElement
}

export const OptionEditorPopover = (props: OptionEditorPopoverProps) => {
  const [draftName, setDraftName] = useState(props.option.name)

  useEffect(() => {
    setDraftName(props.option.name)
  }, [props.option.id, props.option.name, props.open])

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
    <Popover
      open={props.open}
      onOpenChange={props.onOpenChange}
      trigger={props.trigger}
      placement="bottom-start"
      offset={10}
      initialFocus={-1}
      contentClassName="w-[220px] p-1.5"
    >
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

        <div>
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
        </div>
        {props.onDelete ? (
          <div className="border-t border-divider pt-1.5">
            <Button
              variant="ghostDestructive"
              layout="row"
              onClick={() => {
                props.onDelete?.()
                props.onOpenChange(false)
              }}
            >
              {renderMessage(meta.ui.field.options.remove)}
            </Button>
          </div>
        ) : null}
      </div>
    </Popover>
  )
}
