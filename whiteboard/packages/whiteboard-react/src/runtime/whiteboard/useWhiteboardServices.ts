import {
  useEffect,
  useMemo,
  useRef
} from 'react'
import type { CoreRegistries, Document } from '@whiteboard/core/types'
import { normalizeDocument } from '@whiteboard/engine'
import { whiteboardSpec } from '@whiteboard/react/spec'
import type { ResolvedConfig } from '@whiteboard/react/types/common/config'
import type { WhiteboardSpec } from '@whiteboard/react/types/spec'
import {
  createWhiteboardServices,
  type WhiteboardRuntimeServices
} from '@whiteboard/react/runtime/whiteboard/services'
import type { BoardConfig as EngineBoardConfig } from '@whiteboard/engine/config'

type DisposeHandle = ReturnType<typeof globalThis.setTimeout>

export const useWhiteboardServices = (input: {
  document: Document
  onDocumentChange: (document: Document) => void
  coreRegistries?: CoreRegistries
  spec?: WhiteboardSpec
  resolvedConfig: ResolvedConfig
  boardConfig: EngineBoardConfig
}) => {
  const inputDocument = useMemo(
    () => normalizeDocument(input.document),
    [input.document, input.boardConfig]
  )
  const onDocumentChangeRef = useRef(input.onDocumentChange)
  const lastOutboundDocumentRef = useRef<Document>(inputDocument)
  const specRef = useRef(input.spec ?? whiteboardSpec)
  const servicesRef = useRef<WhiteboardRuntimeServices | null>(null)
  const pendingDisposeRef = useRef<DisposeHandle | null>(null)

  onDocumentChangeRef.current = input.onDocumentChange

  if (!servicesRef.current) {
    servicesRef.current = createWhiteboardServices({
      document: inputDocument,
      onDocumentChange: (nextDocument) => {
        lastOutboundDocumentRef.current = nextDocument
        onDocumentChangeRef.current(nextDocument)
      },
      coreRegistries: input.coreRegistries,
      spec: specRef.current,
      resolvedConfig: input.resolvedConfig,
      boardConfig: input.boardConfig
    })
  }

  const services = servicesRef.current

  useEffect(() => {
    if (pendingDisposeRef.current === null) {
      return
    }

    globalThis.clearTimeout(pendingDisposeRef.current)
    pendingDisposeRef.current = null

    return () => {
      if (pendingDisposeRef.current === null) {
        return
      }

      globalThis.clearTimeout(pendingDisposeRef.current)
      pendingDisposeRef.current = null
    }
  }, [services])

  useEffect(() => () => {
    // Delay disposal so StrictMode effect replay does not tear down
    // the live editor instance during the initial development-only pass.
    pendingDisposeRef.current = globalThis.setTimeout(() => {
      if (servicesRef.current === services) {
        servicesRef.current = null
      }
      services.dispose()
      pendingDisposeRef.current = null
    }, 0)
  }, [services])

  const contextServices = useMemo(() => {
    const { history: _history, ...rest } = services
    return rest
  }, [services])

  return {
    services,
    contextServices,
    inputDocument,
    lastOutboundDocumentRef
  }
}
