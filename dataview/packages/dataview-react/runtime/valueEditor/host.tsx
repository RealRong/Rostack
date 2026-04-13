import {
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
  useEffect,
  useState
} from 'react'
import {
  getDocumentFieldById,
  getDocumentRecordById
} from '@dataview/core/document'
import {
  isTitleFieldId
} from '@dataview/core/field'
import {
  FieldValueEditor,
  getFieldValueSpec,
  type FieldValueEditorHandle
} from '#react/field/value'
import {
  useDataView
} from '#react/dataview'
import type { EditInput } from '#react/interaction'
import type {
  ValueEditorResult,
  ValueEditorSession
} from './types'
import {
  OverlayProvider,
  OVERLAY_BLOCKING_ATTR,
  OVERLAY_BLOCKING_BACKDROP_ATTR
} from '@shared/ui/overlay'
import { observeElementSize } from '@shared/dom'
import { useStoreValue } from '@shared/react'

const PANEL_MIN_WIDTH = 180
const PANEL_WIDTHS = {
  default: PANEL_MIN_WIDTH,
  picker: 300,
  calendar: 280
} as const
const VIEWPORT_PADDING = 8
const VIEWPORT_BOTTOM_MARGIN = 28

const clamp = (
  value: number,
  min: number,
  max: number
) => Math.max(min, Math.min(value, max))

export const resolveFieldValueEditorPosition = (input: {
  anchor: ValueEditorSession['anchor']
  viewportWidth: number
  viewportHeight: number
  desiredWidth: number
  panelHeight: number
}) => {
  const viewportBottom = input.viewportHeight - VIEWPORT_BOTTOM_MARGIN
  const maxPanelWidth = Math.max(0, input.viewportWidth - VIEWPORT_PADDING * 2)
  const width = Math.min(
    Math.max(input.desiredWidth, input.anchor.width),
    maxPanelWidth
  )
  const left = clamp(
    input.anchor.x,
    VIEWPORT_PADDING,
    Math.max(VIEWPORT_PADDING, input.viewportWidth - width - VIEWPORT_PADDING)
  )
  const top = clamp(
    input.anchor.y,
    VIEWPORT_PADDING,
    Math.max(VIEWPORT_PADDING, viewportBottom - Math.max(0, input.panelHeight))
  )

  return {
    width,
    left,
    top,
    maxHeight: Math.max(0, viewportBottom - top)
  }
}

export const FieldValueEditorHost = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const valueEditor = dataView.valueEditor
  const session = useStoreValue(valueEditor.store)
  const document = useStoreValue(engine.select.document)
  const field = session?.field
  const valueField = field
    ? getDocumentFieldById(document, field.fieldId)
    : undefined
  const record = field
    ? getDocumentRecordById(document, field.recordId)
    : undefined
  const editorRef = useRef<FieldValueEditorHandle | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [panelHeight, setPanelHeight] = useState(0)
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    setContainer(prev => prev === node ? prev : node)
  }, [])

  const spec = valueField
    ? getFieldValueSpec(valueField)
    : undefined

  const clearSession = useCallback((result?: ValueEditorResult) => {
    const current = valueEditor.store.get()
    if (!current) {
      return
    }

    valueEditor.store.set(null)
    if (!result || result.kind === 'dismiss') {
      current.policy.onDismiss?.()
    }
    current.onResolve?.(result ?? {
      kind: 'dismiss'
    })
  }, [valueEditor.store])

  useEffect(() => () => {
    valueEditor.close()
  }, [valueEditor])

  useEffect(() => {
    if (!session || (valueField && record)) {
      return
    }

    clearSession()
  }, [clearSession, valueField, record, session])

  const position = useMemo(() => {
    if (!session) {
      return null
    }

    const viewportWidth = typeof window === 'undefined'
      ? PANEL_MIN_WIDTH + VIEWPORT_PADDING * 2
      : window.innerWidth
    const viewportHeight = typeof window === 'undefined'
      ? 720
      : window.innerHeight
    const desiredWidth = Math.max(
      PANEL_WIDTHS[spec?.panelWidth ?? 'default'],
      session.anchor.width
    )

    return resolveFieldValueEditorPosition({
      anchor: session.anchor,
      viewportWidth,
      viewportHeight,
      desiredWidth,
      panelHeight
    })
  }, [panelHeight, session, spec?.panelWidth])

  useLayoutEffect(() => {
    if (!session) {
      setPanelHeight(0)
      return
    }

    const panel = panelRef.current
    if (!panel) {
      return
    }

    return observeElementSize(panel, {
      readInitialSize: element => ({
        width: element.clientWidth,
        height: element.scrollHeight
      }),
      readEntrySize: (_entry, element) => ({
        width: element.clientWidth,
        height: element.scrollHeight
      }),
      onChange: next => {
        setPanelHeight(prev => prev === next.height ? prev : next.height)
      }
    })
  }, [session, spec?.panelWidth])

  const closeFromBackdrop = useCallback(() => {
    if (!editorRef.current) {
      valueEditor.close()
      return
    }

    const handled = editorRef.current.submit('outside')
    if (handled) {
      return
    }
  }, [valueEditor])

  if (!session || !valueField || !record || !position) {
    return null
  }

  const writeValue = (value: unknown | undefined) => {
    if (value === undefined) {
      engine.records.values.clear(record.id, valueField.id)
      return
    }

    engine.records.values.set(record.id, valueField.id, value)
  }

  const applyInput = (input: EditInput) => {
    switch (input.type) {
      case 'edit.apply':
        writeValue(input.value)
        return true
      case 'edit.commit':
        writeValue(input.value)
        const action = session.policy.resolveOnCommit(input.trigger)
        clearSession({
          kind: 'commit',
          trigger: input.trigger
        })
        session.policy.applyCloseAction(action)
        return true
      case 'edit.cancel':
        clearSession({
          kind: 'cancel'
        })
        session.policy.onCancel?.()
        return true
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[60]">
      <div
        aria-hidden="true"
        className="pointer-events-auto fixed inset-0"
        {...{
          [OVERLAY_BLOCKING_ATTR]: '',
          [OVERLAY_BLOCKING_BACKDROP_ATTR]: ''
        }}
        onPointerDown={event => {
          event.preventDefault()
          event.stopPropagation()
          closeFromBackdrop()
        }}
        onMouseDown={event => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={event => {
          event.preventDefault()
          event.stopPropagation()
        }}
      />
      <div
        ref={setContainerRef}
        className="pointer-events-auto fixed"
        {...{
          [OVERLAY_BLOCKING_ATTR]: ''
        }}
        style={{
          left: position.left,
          top: position.top,
          width: position.width
        }}
        onPointerDown={event => {
          event.stopPropagation()
        }}
      >
        <OverlayProvider portalRoot={container}>
          <div
            ref={panelRef}
            className="overflow-auto rounded-xl bg-floating shadow-popover"
            style={{
              maxHeight: position.maxHeight
            }}
          >
            <FieldValueEditor
              key={`${session.field.viewId}\u0000${session.field.itemId}\u0000${session.field.fieldId}\u0000${valueField.kind}`}
              ref={editorRef}
              field={valueField}
              value={isTitleFieldId(valueField.id)
                ? record.title
                : record.values[valueField.id]}
              seedDraft={session.seedDraft}
              autoFocus
              onInput={applyInput}
            />
          </div>
        </OverlayProvider>
      </div>
    </div>
  )
}
