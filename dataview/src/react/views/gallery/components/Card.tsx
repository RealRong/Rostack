import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import type {
  GroupProperty,
  GroupRecord,
  ViewId
} from '@dataview/core/contracts'
import {
  shouldCapturePointer
} from '@dataview/dom/interactive'
import {
  useDataView,
  useInlineSessionValue
} from '@dataview/react/dataview'
import { useKeyedStoreValue } from '@dataview/react/store'
import { cn } from '@ui/utils'
import type { AppearanceId } from '@dataview/react/runtime/currentView'
import { CardSurface } from './CardSurface'

const readTitleDraft = (
  titleProperty: GroupProperty | undefined,
  record: GroupRecord
) => {
  if (!titleProperty) {
    return ''
  }

  const value = record.values[titleProperty.id]
  return typeof value === 'string'
    ? value
    : value === undefined || value === null
      ? ''
      : String(value)
}

export const Card = (props: {
  appearanceId: AppearanceId
  record: GroupRecord
  viewId: ViewId
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  selected: boolean
  marqueeSelected: boolean
  active: boolean
  draggingSelected: boolean
  canDrag: boolean
  shouldIgnoreClick: () => boolean
  onPointerDown: (appearanceId: AppearanceId, event: React.PointerEvent<HTMLDivElement>) => void
  onSelect: (mode?: 'replace' | 'toggle') => void
}) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const record = useKeyedStoreValue(engine.read.record, props.record.id) ?? props.record
  const [hovered, setHovered] = useState(false)
  const editing = useInlineSessionValue(target => (
    target?.viewId === props.viewId
      && target.appearanceId === props.appearanceId
  ))
  const [titleDraft, setTitleDraft] = useState(() => readTitleDraft(props.titleProperty, record))
  const committedTitle = readTitleDraft(props.titleProperty, record)
  const titleDraftRef = useRef(titleDraft)
  const committedTitleRef = useRef(committedTitle)

  useEffect(() => {
    titleDraftRef.current = titleDraft
  }, [titleDraft])

  useEffect(() => {
    committedTitleRef.current = committedTitle
  }, [committedTitle])

  useEffect(() => {
    if (editing) {
      return
    }

    setTitleDraft(committedTitle)
  }, [committedTitle, editing])

  const enterEdit = useCallback(() => {
    props.onSelect('replace')
    setTitleDraft(readTitleDraft(props.titleProperty, record))
    dataView.inlineSession.enter({
      viewId: props.viewId,
      appearanceId: props.appearanceId
    })
  }, [
    dataView.inlineSession,
    props.appearanceId,
    props.onSelect,
    props.titleProperty,
    props.viewId,
    record
  ])

  const commitTitle = useCallback(() => {
    if (!props.titleProperty) {
      return
    }

    const nextValue = titleDraftRef.current.trim()
    if (nextValue === committedTitleRef.current) {
      return
    }

    engine.records.setValue(record.id, props.titleProperty.id, nextValue)
  }, [
    engine.records,
    record.id,
    props.titleProperty
  ])

  const cancelEdit = useCallback(() => {
    setTitleDraft(committedTitleRef.current)
    dataView.inlineSession.exit()
  }, [dataView.inlineSession])

  useEffect(() => {
    if (!editing) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (dataView.valueEditor.store.get()) {
        dataView.valueEditor.close()
        return
      }

      cancelEdit()
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (dataView.valueEditor.store.get()) {
        return
      }

      const target = event.target
      const ownerCardId = target instanceof Element
        ? target.closest('[data-gallery-card-id]')?.getAttribute('data-gallery-card-id')
        : null
      if (ownerCardId === props.appearanceId) {
        return
      }

      commitTitle()
      dataView.inlineSession.exit()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [
    cancelEdit,
    commitTitle,
    dataView.inlineSession,
    dataView.valueEditor,
    editing,
    props.appearanceId
  ])

  return (
    <div
      data-gallery-card-id={props.appearanceId}
      onPointerEnter={() => {
        setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
      }}
      onPointerDown={event => {
        if (editing) {
          return
        }

        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        props.onPointerDown(props.appearanceId, event)
      }}
      onClick={event => {
        if (editing) {
          return
        }

        if (props.shouldIgnoreClick()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        props.onSelect(event.metaKey || event.ctrlKey ? 'toggle' : 'replace')
      }}
      className={cn(
        'touch-none',
        !editing && 'select-none',
        !editing && props.canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        props.active && 'opacity-35',
        props.draggingSelected && !props.active && 'opacity-60'
      )}
    >
      <CardSurface
        appearanceId={props.appearanceId}
        record={record}
        viewId={props.viewId}
        titleProperty={props.titleProperty}
        properties={props.properties}
        selected={props.selected}
        marqueeSelected={props.marqueeSelected}
        mode={editing ? 'edit' : 'view'}
        showEditAction={hovered && !editing && !props.active}
        titleDraft={titleDraft}
        onTitleDraftChange={setTitleDraft}
        onEnterEdit={enterEdit}
        onCommitTitle={commitTitle}
        onSelect={() => props.onSelect('replace')}
      />
    </div>
  )
}
