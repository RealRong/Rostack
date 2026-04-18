import {
  createContext,
  useContext,
  useEffect,
  useMemo
} from 'react'
import type {
  DataViewReactContextValue,
  DataViewReactSession,
  EngineProviderProps
} from '@dataview/react/dataview/types'
import {
  createDataViewReactSession
} from '@dataview/react/dataview/runtime'
import {
  ensureDataviewTokenResolvers
} from '@dataview/react/i18n/register'

const DataViewContext = createContext<DataViewReactContextValue | null>(null)
ensureDataviewTokenResolvers()

export const EngineProvider = (props: EngineProviderProps) => (
  <EngineProviderInner {...props} />
)

const EngineProviderInner = (props: EngineProviderProps) => {
  const runtime = useMemo<DataViewReactSession>(() => createDataViewReactSession({
    engine: props.engine,
    initialPage: props.initialPage
  }), [props.engine])

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
    throw new Error('Missing <EngineProvider>.')
  }

  return value
}

export const useDataViewRead = () => useDataView().read

export const useDataViewWrite = () => useDataView().write

export const useDataViewSession = () => useDataView().session

export const useDataViewIntent = () => useDataView().intent
