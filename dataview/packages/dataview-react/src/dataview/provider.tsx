import {
  createContext,
  useContext,
  useEffect,
  useMemo
} from 'react'
import type {
  MutationCollabEngine
} from '@shared/collab'
import {
  createYjsMutationCollabSession
} from '@shared/collab-yjs'
import {
  document as documentApi
} from '@dataview/core/document'
import {
  dataviewMutationSchema
} from '@dataview/core/mutation'
import type {
  DataViewReactContextValue,
  DataViewCollabSession,
  DataViewReactSession,
  DataViewProviderProps
} from '@dataview/react/dataview/types'
import {
  createDataViewReactSession
} from '@dataview/react/dataview/runtime'
import {
  ensureDataviewTokenResolvers
} from '@dataview/react/i18n/register'
import type {
  EngineApplyCommit
} from '@dataview/engine/contracts/write'
import type {
  MutationCommit,
  MutationDocument
} from '@shared/mutation'

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

    const collabEngine = {
      commits: {
        subscribe: (listener) => props.engine.commits.subscribe((commit) => {
          listener({
            ...commit,
            writes: commit.writes
          } as MutationCommit<typeof dataviewMutationSchema>)
        })
      },
      doc: () => props.engine.doc() as MutationDocument<typeof dataviewMutationSchema>,
      replace: (document: MutationDocument<typeof dataviewMutationSchema>, options) => (
        props.engine.replace(document as ReturnType<typeof props.engine.doc>, options)
      ),
      apply: (writes, options) => props.engine.apply(writes, options)
    } as MutationCollabEngine<
      typeof dataviewMutationSchema,
      EngineApplyCommit
    >

    const session = createYjsMutationCollabSession({
      schema: dataviewMutationSchema,
      engine: collabEngine,
      doc: props.collab.doc,
      actorId: props.collab.actorId,
      provider: props.collab.provider,
      document: {
        empty: () => documentApi.normalize(documentApi.create()),
        decode: (value) => documentApi.normalize(documentApi.clone(value as ReturnType<typeof props.engine.doc>))
      }
    })
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
      session.destroy()
      props.collab?.onSession?.(null)
    }
  }, [
    props.collab,
    props.engine
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
