import {
  createContext,
  useContext,
  useEffect,
  useMemo
} from 'react'
import {
  collab as collabApi,
  type CollabSession
} from '@dataview/collab'
import type {
  DataViewReactContextValue,
  DataViewReactSession,
  DataViewProviderProps
} from '@dataview/react/dataview/types'
import {
  createDataViewReactSession
} from '@dataview/react/dataview/runtime'
import {
  ensureDataviewTokenResolvers
} from '@dataview/react/i18n/register'

const DataViewContext = createContext<DataViewReactContextValue | null>(null)
ensureDataviewTokenResolvers()

export const DataViewProvider = (props: DataViewProviderProps) => (
  <DataViewProviderInner {...props} />
)

const DataViewProviderInner = (props: DataViewProviderProps) => {
  const runtime = useMemo<DataViewReactSession>(() => createDataViewReactSession({
    engine: props.engine,
    page: props.page
  }), [props.engine, props.page])

  useEffect(() => {
    if (!props.collab) {
      return
    }

    const session = collabApi.yjs.session.create({
      engine: props.engine,
      doc: props.collab.doc,
      actorId: props.collab.actorId,
      provider: props.collab.provider
    })
    runtime.history.set(session.localHistory)
    props.collab.onSession?.(session)
    props.collab.onStatusChange?.(session.status.get())

    const unsubscribeStatus = session.status.subscribe(() => {
      props.collab?.onStatusChange?.(session.status.get())
    })

    if (props.collab.autoConnect ?? true) {
      session.connect()
    }

    return () => {
      unsubscribeStatus()
      runtime.history.reset()
      session.destroy()
      props.collab?.onSession?.(null)
    }
  }, [
    props.collab,
    props.engine,
    runtime.history
  ])

  useEffect(() => () => {
    runtime.dispose()
  }, [runtime])

  return (
    <DataViewContext.Provider value={runtime}>
      {props.children}
    </DataViewContext.Provider>
  )
}

export const useDataView = (): DataViewReactContextValue => {
  const value = useContext(DataViewContext)
  if (!value) {
    throw new Error('Missing <DataViewProvider>.')
  }

  return value
}

export const useDataViewModel = () => useDataView().model

export const usePageModel = () => useDataView().model.page

export const useDataViewSource = () => useDataView().source

export const useDataViewSession = () => useDataView().session
