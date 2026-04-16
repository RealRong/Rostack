import {
  useEffect,
  useRef
} from 'react'
import { meta } from '@dataview/meta'
import {
  OptionToken
} from '@dataview/react/field/options'
import {
  Menu,
  type MenuHandle
} from '@shared/ui/menu'
import { focusInputWithoutScroll } from '@shared/dom'
import { PickerInputBar } from '@dataview/react/field/value/editor/shared/PickerInputBar'
import { usePickerKeydown } from '@dataview/react/field/value/editor/shared/usePickerKeydown'
import { useTranslation } from '@shared/i18n/react'
import {
  type OptionPickerControllerInput,
  type PickerMode,
  useOptionPickerController
} from '@dataview/react/field/value/editor/pickers/option/useOptionPickerController'

export type { PickerMode }

export interface OptionPickerEditorProps extends OptionPickerControllerInput {
  mode: PickerMode
}

export const OptionPickerEditor = (
  props: OptionPickerEditorProps
) => {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<MenuHandle | null>(null)
  const controller = useOptionPickerController(props)

  useEffect(() => {
    if (!props.autoFocus) {
      return
    }

    focusInputWithoutScroll(inputRef.current)
  }, [props.autoFocus])

  const onKeyDown = usePickerKeydown({
    editingBlocked: Boolean(controller.editingOptionId),
    onMoveNext: () => {
      menuRef.current?.moveNext()
    },
    onMovePrev: () => {
      menuRef.current?.movePrev()
    },
    onMoveFirst: () => {
      menuRef.current?.moveFirst()
    },
    onMoveLast: () => {
      menuRef.current?.moveLast()
    },
    onCancel: props.onCancel,
    onCommit: trigger => {
      controller.handleCommit(menuRef.current?.getActiveKey() ?? null, trigger)
    }
  })

  if (!props.field) {
    return null
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col" onKeyDown={onKeyDown}>
      <div>
        <PickerInputBar
          inputRef={inputRef}
          value={controller.query}
          onValueChange={controller.onQueryChange}
          placeholder={controller.selectedOptions.length
            ? ''
            : t(meta.ui.field.options.selectOrCreate(props.mode === 'multi'))}
        >
          {controller.selectedOptions.map(option => (
            <OptionToken
              key={option.id}
              label={option.label}
              color={option.color}
              onRemove={() => {
                controller.removeSelectedOption(option.id)
                focusInputWithoutScroll(inputRef.current)
              }}
            />
          ))}
        </PickerInputBar>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-divider">
        <div className="px-3 py-2 text-[12px] font-medium text-muted-foreground">
          {t(meta.ui.field.options.selectOrCreate(props.mode === 'multi'))}
        </div>

        <div className="max-h-72 overflow-y-auto px-2 pb-2">
          {controller.normalized ? (
            <Menu
              ref={menuRef}
              items={controller.pickerItems}
              selectionMode={props.mode === 'single' ? 'single' : 'multiple'}
              selectionAppearance="none"
              value={props.mode === 'single'
                ? props.draft
                : controller.selectedOptions.map(option => option.id)}
              className="gap-0.5"
              autoFocus={false}
            />
          ) : (
            <Menu.Reorder
              items={controller.reorderableItems}
              selectionMode={props.mode === 'single' ? 'single' : 'multiple'}
              selectionAppearance="none"
              value={props.mode === 'single'
                ? props.draft
                : controller.selectedOptions.map(option => option.id)}
              className="gap-0.5"
              onMove={controller.reorderOptions}
            />
          )}
        </div>
      </div>
    </div>
  )
}
