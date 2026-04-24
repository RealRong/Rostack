import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import { SquarePen } from 'lucide-react'
import {
  TITLE_FIELD_ID,
  type RecordId,
  type ViewId
} from '@dataview/core/contracts'
import type {
  ItemId
} from '@dataview/engine'
import {
  useDataView
} from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import { useTranslation } from '@shared/i18n/react'
import {
  resolveInlineSessionExitEffect
} from '@dataview/runtime'
import type {
  CardTitle
} from '@dataview/runtime'
import {
  focusInputWithoutScroll
} from '@shared/dom'
import { Button } from '@shared/ui/button'
import { cn } from '@shared/ui/utils'
import {
  useKeyedStoreValue
} from '@shared/react'

interface EditableCardTitleState {
  editing: boolean
  titleDraft: string
  setTitleDraft: (value: string) => void
  enterEdit: () => void
  commitTitle: () => void
  submitTitle: () => void
}

const useEditableCardTitleState = (input: {
  viewId: ViewId
  itemId: ItemId
  recordId: RecordId
  title: CardTitle
}): EditableCardTitleState => {
  const dataView = useDataView()
  const editing = useKeyedStoreValue<string, boolean>(
    dataView.session.inline.editing,
    dataView.session.inline.key({
      viewId: input.viewId,
      itemId: input.itemId
    })
  )
  const [titleDraft, setTitleDraft] = useState(() => input.title.value)
  const titleDraftRef = useRef(titleDraft)
  const committedTitleRef = useRef(input.title.value)
  const exitEffectRef = useRef<ReturnType<typeof resolveInlineSessionExitEffect> | null>(null)

  useEffect(() => {
    titleDraftRef.current = titleDraft
  }, [titleDraft])

  useEffect(() => {
    committedTitleRef.current = input.title.value
  }, [input.title.value])

  useEffect(() => {
    if (editing) {
      exitEffectRef.current = null
      return
    }

    setTitleDraft(input.title.value)
  }, [editing, input.title.value])

  const enterEdit = useCallback(() => {
    setTitleDraft(input.title.value)
    dataView.session.selection.command.clear()
    dataView.session.inline.enter({
      viewId: input.viewId,
      itemId: input.itemId
    })
  }, [
    dataView.session.inline,
    dataView.session.selection,
    input.itemId,
    input.title.value,
    input.viewId
  ])

  const commitTitle = useCallback(() => {
    if (exitEffectRef.current === 'discard') {
      return
    }

    const nextValue = titleDraftRef.current.trim()
    if (nextValue === committedTitleRef.current) {
      return
    }

    committedTitleRef.current = nextValue
    dataView.engine.records.fields.set(input.recordId, TITLE_FIELD_ID, nextValue)
  }, [
    dataView.engine.records.fields,
    input.recordId
  ])

  const resetTitleDraft = useCallback(() => {
    setTitleDraft(committedTitleRef.current)
  }, [])

  const submitTitle = useCallback(() => {
    commitTitle()
    dataView.session.inline.exit({
      reason: 'submit'
    })
  }, [commitTitle, dataView.session.inline])

  useEffect(() => {
    if (!editing) {
      return
    }

    return dataView.session.inline.onExit(event => {
      if (
        event.target.viewId !== input.viewId
        || event.target.itemId !== input.itemId
      ) {
        return
      }

      const exitEffect = resolveInlineSessionExitEffect(event.reason)
      exitEffectRef.current = exitEffect
      if (exitEffect === 'discard') {
        resetTitleDraft()
        return
      }

      commitTitle()
    })
  }, [
    commitTitle,
    dataView.session.inline,
    editing,
    input.itemId,
    input.viewId,
    resetTitleDraft
  ])

  return {
    editing,
    titleDraft,
    setTitleDraft,
    enterEdit,
    commitTitle,
    submitTitle
  }
}

export interface EditableCardTitleProps {
  viewId: ViewId
  itemId: ItemId
  recordId: RecordId
  title: CardTitle
  wrap?: boolean
  showEditAction?: boolean
  rootClassName?: string
  textClassName?: string
  inputClassName?: string
  editActionClassName?: string
}

export const EditableCardTitle = (props: EditableCardTitleProps) => {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const state = useEditableCardTitleState({
    viewId: props.viewId,
    itemId: props.itemId,
    recordId: props.recordId,
    title: props.title
  })

  useEffect(() => {
    if (!state.editing) {
      return
    }

    focusInputWithoutScroll(inputRef.current)
  }, [state.editing])

  return (
    <>
      {props.showEditAction && !state.editing ? (
        <div className={
          cn(
            "absolute right-2 top-2.5 bg-surface-muted border rounded z-10 opacity-0 pointer-events-none transition-opacity",
            'group-hover/record-card:opacity-100 group-hover/record-card:pointer-events-auto',
            'group-focus-within/record-card:opacity-100 group-focus-within/record-card:pointer-events-auto',
          )
        }>
          <Button
            data-drag-clone-hidden=""
            size="icon"
            variant="ghost"
            className={cn(
              props.editActionClassName,
              'rounded'
            )}
            aria-label="Edit card"
            title="Edit card"
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              state.enterEdit()
            }}
          >
            <SquarePen className="size-4" size={15} strokeWidth={1.8} />
          </Button>
        </div>
      ) : null}
      {state.editing ? (
        <input
          ref={inputRef}
          value={state.titleDraft}
          placeholder={t(meta.ui.card.titlePlaceholder)}
          className={cn(
            'min-w-0',
            props.rootClassName,
            'h-auto rounded-none outline-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0',
            props.inputClassName
          )}
          onClick={event => {
            event.stopPropagation()
          }}
          onChange={event => {
            state.setTitleDraft(event.target.value)
          }}
          onBlur={() => {
            state.commitTitle()
          }}
          onKeyDown={event => {
            event.stopPropagation()
            if (event.key === 'Enter') {
              event.preventDefault()
              state.submitTitle()
            }
          }}
        />
      ) : (
        <div
          className={cn(
            'min-w-0',
            props.wrap
              ? 'whitespace-normal break-words [overflow-wrap:anywhere]'
              : 'truncate',
            props.rootClassName,
            props.title.value.trim()
              ? 'text-foreground'
              : 'text-muted-foreground',
            props.textClassName
          )}
        >
          {props.title.value.trim() || t(meta.ui.card.emptyTitle)}
        </div>
      )}
    </>
  )
}
