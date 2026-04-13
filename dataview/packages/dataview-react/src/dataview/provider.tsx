import {
  createContext,
  useContext,
  useEffect,
  useMemo
} from 'react'
import type {
  DataViewContextValue,
  DataViewSession,
  EngineProviderProps
} from '#react/dataview/types.ts'
import {
  createDataViewSession
} from '#react/dataview/runtime.ts'

const DataViewContext = createContext<DataViewContextValue | null>(null)
export const EngineProvider = (props: EngineProviderProps) => (
  <EngineProviderInner {...props} />
)

const EngineProviderInner = (props: EngineProviderProps) => {
  const runtime = useMemo<DataViewSession>(() => createDataViewSession({
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

export const useDataView = (): DataViewContextValue => {
  const value = useContext(DataViewContext)
  if (!value) {
    throw new Error('Missing <EngineProvider>.')
  }

  return value
}
