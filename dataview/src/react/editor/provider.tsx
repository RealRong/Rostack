import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode
} from 'react'
import type { GroupEngine } from '@/engine'
import {
  createDerivedStore,
  createValueStore,
  type ReadStore,
  type ValueStore
} from '@/runtime/store'
import {
  createCurrentViewStore,
} from '@/react/view/currentViewStore'
import type {
  CurrentView
} from '@/react/view'
import {
  createResolvedPageStateStore,
} from '@/react/page/session/state'
import {
  createPageSessionApi
} from '@/react/page/session/api'
import type {
  PageSessionApi,
  PageSessionInput,
  ResolvedPageState
} from '@/react/page/session/types'
import type {
  CloseValueEditorOptions,
  OpenValueEditorInput,
  PropertyEditApi,
  PropertyEditSession,
  ValueEditorAnchor,
  ValueEditorResult,
  ViewFieldRef
} from '@/react/propertyEdit/types'

export interface EngineProviderProps {
  engine: GroupEngine
  initialPage?: PageSessionInput
  children?: ReactNode
}

export interface EditorContextValue {
  engine: GroupEngine
  currentViewStore: ReadStore<CurrentView | undefined>
  pageStore: ReadStore<ResolvedPageState>
  page: PageSessionApi
  propertyEdit: PropertyEditApi
  propertyEditSessionStore: ValueStore<PropertyEditSession | null>
}

const EditorContext = createContext<EditorContextValue | null>(null)
export const EngineProvider = (props: EngineProviderProps) => (
  <EngineProviderInner {...props} />
)

const cloneField = (
  field: ViewFieldRef
): ViewFieldRef => ({
  ...field
})

const normalizeAnchor = (
  anchor: ValueEditorAnchor
): ValueEditorAnchor => ({
  x: Number.isFinite(anchor.x)
    ? Math.round(anchor.x)
    : 0,
  y: Number.isFinite(anchor.y)
    ? Math.round(anchor.y)
    : 0,
  width: Number.isFinite(anchor.width)
    ? Math.max(0, Math.round(anchor.width))
    : 0
})

const createSession = (
  input: OpenValueEditorInput
): PropertyEditSession => ({
  field: cloneField(input.field),
  anchor: normalizeAnchor(input.anchor),
  ...(input.seedDraft !== undefined
    ? {
        seedDraft: input.seedDraft
      }
    : {}),
  ...(input.onResolve
    ? {
        onResolve: input.onResolve
      }
    : {})
})

const dismissSession = (
  store: ValueStore<PropertyEditSession | null>,
  options?: {
    result?: ValueEditorResult
    silent?: boolean
  }
) => {
  const current = store.get()
  if (!current) {
    return
  }

  store.set(null)
  if (options?.silent) {
    return
  }

  current.onResolve?.(options?.result ?? {
    kind: 'dismiss'
  })
}

const EngineProviderInner = (props: EngineProviderProps) => {
  const page = useMemo(() => createPageSessionApi(props.initialPage), [])
  const propertyEditSessionStore = useMemo(() => createValueStore<PropertyEditSession | null>({
    initial: null
  }), [])
  const valueEditorOpen = useMemo(() => createDerivedStore<boolean>({
    get: read => Boolean(read(propertyEditSessionStore))
  }), [propertyEditSessionStore])
  const propertyEdit = useMemo<PropertyEditApi>(() => ({
    open: input => {
      dismissSession(propertyEditSessionStore)
      propertyEditSessionStore.set(createSession(input))
      return true
    },
    close: (options?: CloseValueEditorOptions) => {
      dismissSession(propertyEditSessionStore, {
        silent: options?.silent
      })
    }
  }), [propertyEditSessionStore])
  const pageStateStore = useMemo(() => createResolvedPageStateStore({
    document: props.engine.read.document,
    page: page.store,
    valueEditorOpen
  }), [page.store, props.engine, valueEditorOpen])
  const {
    currentView,
    dispose
  } = useMemo(() => createCurrentViewStore({
    engine: props.engine,
    pageStateStore
  }), [pageStateStore, props.engine])

  useEffect(() => () => {
    dispose()
    page.dispose()
  }, [dispose, page])

  const value = useMemo<EditorContextValue>(() => ({
    engine: props.engine,
    currentViewStore: currentView,
    pageStore: pageStateStore,
    page,
    propertyEdit,
    propertyEditSessionStore
  }), [
    currentView,
    page,
    pageStateStore,
    propertyEdit,
    propertyEditSessionStore,
    props.engine
  ])

  return (
    <EditorContext.Provider value={value}>
      {props.children}
    </EditorContext.Provider>
  )
}

export const useEditorContext = (): EditorContextValue => {
  const value = useContext(EditorContext)
  if (!value) {
    throw new Error('Missing <EngineProvider>.')
  }

  return value
}
