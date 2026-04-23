import {
  createContext,
  useContext,
  useEffect,
  useMemo
} from 'react'
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
