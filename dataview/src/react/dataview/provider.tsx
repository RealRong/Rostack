import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode
} from 'react'
import type {
  DataViewContextValue,
  DataViewRuntime
} from './runtime'
import {
  createDataViewRuntime
} from './runtime'
import type {
  Engine
} from '@dataview/engine'
import type {
  PageSessionInput
} from '@dataview/react/page/session/types'

export interface EngineProviderProps {
  engine: Engine
  initialPage?: PageSessionInput
  children?: ReactNode
}
export type { DataViewContextValue } from './runtime'

const DataViewContext = createContext<DataViewContextValue | null>(null)
export const EngineProvider = (props: EngineProviderProps) => (
  <EngineProviderInner {...props} />
)

const EngineProviderInner = (props: EngineProviderProps) => {
  const runtime = useMemo<DataViewRuntime>(() => createDataViewRuntime({
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
