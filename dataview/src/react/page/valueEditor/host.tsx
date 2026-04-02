import {
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
  useEffect,
  useState
} from 'react'
import {
  PropertyValueEditor,
  getPropertyValueSpec,
  type PropertyValueEditorHandle
} from '@dataview/react/properties/value'
import {
  useEngine
} from '@dataview/react/editor'
import { useEditorContext } from '@dataview/react/editor/provider'
import type { EditInput } from '@dataview/react/page/interaction'
import {
  type PropertyEditSession,
  type ValueEditorResult,
} from '@dataview/react/propertyEdit'
import {
  BLOCKING_SURFACE_ATTR,
  useBlockingSurface
} from '@ui/blocking-surface'
import { PopoverContainerProvider } from '@ui/popover'
import { useStoreValue } from '@dataview/react/runtime/store'

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

export const resolvePropertyValueEditorPosition = (input: {
  anchor: PropertyEditSession['anchor']
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

export const PropertyValueEditorHost = () => {
  const engine = useEngine()
  const {
    propertyEdit,
    propertyEditSessionStore
  } = useEditorContext()
  const session = useStoreValue(propertyEditSessionStore)
  const property = session
    ? engine.read.property.get(session.field.propertyId)
    : undefined
  const record = session
    ? engine.read.record.get(session.field.recordId)
    : undefined
  const view = session
    ? engine.read.view.get(session.field.viewId)
    : undefined
  const editorRef = useRef<PropertyValueEditorHandle | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [panelHeight, setPanelHeight] = useState(0)
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    setContainer(prev => prev === node ? prev : node)
  }, [])

  const spec = property
    ? getPropertyValueSpec(property)
    : undefined

  const clearSession = useCallback((result?: ValueEditorResult) => {
    const current = propertyEditSessionStore.get()
    if (!current) {
      return
    }

    propertyEditSessionStore.set(null)
    current.onResolve?.(result ?? {
      kind: 'dismiss'
    })
  }, [propertyEditSessionStore])

  useEffect(() => () => {
    propertyEdit.close()
  }, [propertyEdit])

  useEffect(() => {
    if (!session || (property && record)) {
      return
    }

    clearSession()
  }, [clearSession, property, record, session])

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

    return resolvePropertyValueEditorPosition({
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

    const measure = () => {
      const next = panel.scrollHeight
      setPanelHeight(prev => prev === next ? prev : next)
    }

    measure()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    return () => {
      observer.disconnect()
    }
  }, [session, spec?.panelWidth])

  const closeFromBackdrop = useCallback(() => {
    const handled = editorRef.current?.submit('done')
    if (handled === true) {
      return
    }

    if (handled === undefined) {
      propertyEdit.close()
    }
  }, [propertyEdit])

  useBlockingSurface({
    open: Boolean(session && property && record && position),
    source: 'property-edit',
    backdrop: 'transparent',
    dismissOnBackdropPress: true,
    onDismiss: closeFromBackdrop
  })

  if (!session || !property || !record || !position) {
    return null
  }

  const applyInput = (input: EditInput) => {
    switch (input.type) {
      case 'edit.commit':
        if (input.value === undefined) {
          engine.records.clearValue(record.id, property.id)
        } else {
          engine.records.setValue(record.id, property.id, input.value)
        }
        clearSession({
          kind: 'commit',
          intent: input.intent
        })
        return true
      case 'edit.cancel':
        clearSession({
          kind: 'cancel'
        })
        return true
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[60]">
      <div
        ref={setContainerRef}
        className="pointer-events-auto fixed"
        {...{
          [BLOCKING_SURFACE_ATTR]: ''
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
        <PopoverContainerProvider container={container}>
          <div
            ref={panelRef}
            className="ui-popover-panel ui-surface-floating overflow-auto rounded-xl"
            style={{
              maxHeight: position.maxHeight
            }}
          >
            <PropertyValueEditor
              key={`${session.field.viewId}\u0000${session.field.appearanceId}\u0000${session.field.propertyId}`}
              ref={editorRef}
              property={property}
              value={record.values[property.id]}
              seedDraft={session.seedDraft}
              autoFocus
              enterIntent={view?.type === 'table'
                ? 'next-item'
                : 'done'}
              onInput={applyInput}
            />
          </div>
        </PopoverContainerProvider>
      </div>
    </div>
  )
}
