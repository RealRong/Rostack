import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode
} from 'react'
import type { GroupEngine } from '@dataview/engine'
import {
  createDerivedStore,
  createValueStore,
  type ReadStore,
  type ValueStore
} from '@dataview/runtime/store'
import {
  createCurrentViewStore,
} from '@dataview/react/currentView/store'
import type {
  CurrentView
} from '@dataview/react/currentView'
import {
  createResolvedPageStateStore,
} from '@dataview/react/page/session/state'
import {
  createPageSessionApi
} from '@dataview/react/page/session/api'
import type {
  PageSessionApi,
  PageSessionInput,
  ResolvedPageState
} from '@dataview/react/page/session/types'
import type {
  CloseValueEditorOptions,
  OpenValueEditorInput,
  PropertyEditApi,
  PropertyEditSession,
  ValueEditorAnchor,
  ValueEditorResult,
  ViewFieldRef
} from '@dataview/react/page/valueEditor'

export interface EngineProviderProps {
  engine: GroupEngine
  initialPage?: PageSessionInput
  children?: ReactNode
}

export interface DataViewContextValue {
  engine: GroupEngine
  currentView: {
    store: ReadStore<CurrentView | undefined>
    get: () => CurrentView | undefined
  }
  page: PageSessionApi & {
    store: ReadStore<ResolvedPageState>
  }
  valueEditor: PropertyEditApi & {
    sessionStore: ValueStore<PropertyEditSession | null>
  }
}

const DataViewContext = createContext<DataViewContextValue | null>(null)
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
  const valueEditorSessionStore = useMemo(() => createValueStore<PropertyEditSession | null>({
    initial: null
  }), [])
  const valueEditorOpen = useMemo(() => createDerivedStore<boolean>({
    get: read => Boolean(read(valueEditorSessionStore))
  }), [valueEditorSessionStore])
  const valueEditor = useMemo<PropertyEditApi & {
    sessionStore: ValueStore<PropertyEditSession | null>
  }>(() => ({
    sessionStore: valueEditorSessionStore,
    open: input => {
      dismissSession(valueEditorSessionStore)
      valueEditorSessionStore.set(createSession(input))
      return true
    },
    close: (options?: CloseValueEditorOptions) => {
      dismissSession(valueEditorSessionStore, {
        silent: options?.silent
      })
    }
  }), [valueEditorSessionStore])
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
    pageStore: page.store
  }), [page.store, props.engine])

  useEffect(() => () => {
    dispose()
    page.dispose()
  }, [dispose, page])

  const value = useMemo<DataViewContextValue>(() => ({
    engine: props.engine,
    currentView: {
      store: currentView,
      get: currentView.get
    },
    page: {
      ...page,
      store: pageStateStore
    },
    valueEditor
  }), [
    currentView,
    page,
    pageStateStore,
    valueEditor,
    props.engine
  ])

  return (
    <DataViewContext.Provider value={value}>
      {props.children}
    </DataViewContext.Provider>
  )
}

export const useDataView = (): DataViewContextValue => {
  const value = useContext(DataViewContext)
  if (!value) {
    throw new Error('Missing <EngineProvider>.')
  }

  return value
}
