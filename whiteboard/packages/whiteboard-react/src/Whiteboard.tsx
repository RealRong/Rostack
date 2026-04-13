import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { OverlayProvider } from '@shared/ui'
import type { Document } from '@whiteboard/core/types'
import {
  createYjsSession,
  type CollabSession
} from '@whiteboard/collab'
import { normalizeDocument } from '@whiteboard/engine'
import type { WhiteboardProps } from '#whiteboard-react/types/common/board'
import { resolveConfig } from '#whiteboard-react/config'
import { createDefaultNodeRegistry } from '#whiteboard-react/features/node'
import {
  getSelectionSnapshot,
  resolvePresenceActivity,
  serializePresenceTool
} from '#whiteboard-react/features/collab/presence'
import {
  WhiteboardConfigProvider,
  WhiteboardServicesProvider
} from '#whiteboard-react/runtime/hooks/useWhiteboard'
import type { WhiteboardInstance as Editor } from '#whiteboard-react/types/runtime'
import type {
  WhiteboardPresenceActivity,
  WhiteboardPresencePointer
} from '#whiteboard-react/types/common/presence'
import { Surface } from '#whiteboard-react/canvas/Surface'
import {
  createWhiteboardServices,
  isMirroredDocumentFromEngine
} from '#whiteboard-react/runtime/whiteboard/services'

const POINTER_THROTTLE_MS = 16

const readNow = () => (
  typeof performance !== 'undefined'
    ? performance.now()
    : Date.now()
)

const WhiteboardInner = forwardRef<Editor | null, WhiteboardProps>(function WhiteboardInner(
  {
    document,
    onDocumentChange,
    coreRegistries,
    nodeRegistry,
    collab,
    options
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const {
    resolvedConfig,
    boardConfig,
    editorConfig,
    viewportLimits
  } = useMemo(
    () => resolveConfig(options),
    [options]
  )
  const inputDocument = useMemo(
    () => normalizeDocument(document, boardConfig),
    [document, boardConfig]
  )
  const onDocumentChangeRef = useRef(onDocumentChange)
  const lastOutboundDocumentRef = useRef<Document>(inputDocument)
  const registryRef = useRef(nodeRegistry ?? createDefaultNodeRegistry())
  const servicesRef = useRef<ReturnType<typeof createWhiteboardServices> | null>(null)
  const collabSessionRef = useRef<CollabSession | null>(null)
  const onCollabSessionRef = useRef(collab?.onSession)
  const onCollabStatusChangeRef = useRef(collab?.onStatusChange)
  const lastCollabSessionCallbackRef = useRef(collab?.onSession)
  const lastCollabStatusCallbackRef = useRef(collab?.onStatusChange)
  const lastPointerPublishAtRef = useRef(0)

  onDocumentChangeRef.current = onDocumentChange
  onCollabSessionRef.current = collab?.onSession
  onCollabStatusChangeRef.current = collab?.onStatusChange

  if (!servicesRef.current) {
    servicesRef.current = createWhiteboardServices({
      document: inputDocument,
      onDocumentChange: (nextDocument) => {
        lastOutboundDocumentRef.current = nextDocument
        onDocumentChangeRef.current(nextDocument)
      },
      coreRegistries,
      registry: registryRef.current,
      resolvedConfig,
      boardConfig
    })
  }

  const services = servicesRef.current
  const editor = services.editor
  const engine = services.engine

  useImperativeHandle(ref, () => editor, [editor])

  useEffect(() => () => {
    editor.actions.app.dispose()
  }, [editor])

  useEffect(() => {
    editor.actions.app.configure(editorConfig)
  }, [editor, editorConfig])

  useEffect(() => {
    editor.actions.viewport.setLimits(viewportLimits)
  }, [editor, viewportLimits])

  useEffect(() => {
    if (isMirroredDocumentFromEngine(document, inputDocument)) {
      return
    }
    if (!isMirroredDocumentFromEngine(lastOutboundDocumentRef.current, inputDocument)) {
      return
    }
    onDocumentChangeRef.current(inputDocument)
  }, [document, inputDocument])

  useEffect(() => {
    if (isMirroredDocumentFromEngine(lastOutboundDocumentRef.current, inputDocument)) {
      return
    }
    lastOutboundDocumentRef.current = inputDocument
    editor.actions.app.replace(inputDocument)
  }, [editor, inputDocument])

  useEffect(() => {
    if (!collab) {
      return
    }

    const session = createYjsSession({
      engine,
      doc: collab.doc,
      provider: collab.provider,
      bootstrap: collab.bootstrap
    })
    collabSessionRef.current = session
    onCollabSessionRef.current?.(session)
    onCollabStatusChangeRef.current?.(session.status.get())

    const unsubscribeStatus = session.status.subscribe(() => {
      onCollabStatusChangeRef.current?.(session.status.get())
    })

    if (collab.autoConnect ?? true) {
      session.connect()
    }

    return () => {
      unsubscribeStatus()
      collabSessionRef.current = null
      onCollabSessionRef.current?.(null)
      session.destroy()
    }
  }, [
    collab?.autoConnect,
    collab?.bootstrap,
    collab?.doc,
    collab?.provider,
    engine
  ])

  useEffect(() => {
    if (lastCollabSessionCallbackRef.current === collab?.onSession) {
      return
    }
    lastCollabSessionCallbackRef.current = collab?.onSession
    if (!collab?.onSession || !collabSessionRef.current) {
      return
    }
    collab.onSession(collabSessionRef.current)
  }, [collab?.onSession])

  useEffect(() => {
    if (lastCollabStatusCallbackRef.current === collab?.onStatusChange) {
      return
    }
    lastCollabStatusCallbackRef.current = collab?.onStatusChange
    if (!collab?.onStatusChange || !collabSessionRef.current) {
      return
    }
    collab.onStatusChange(collabSessionRef.current.status.get())
  }, [collab?.onStatusChange])

  useEffect(() => {
    const binding = collab?.presence?.binding
    if (!binding) {
      return
    }

    const syncPresence = (input?: {
      pointer?: WhiteboardPresencePointer
      clearPointer?: boolean
      activity?: WhiteboardPresenceActivity
    }) => {
      binding.updateLocalState((prev) => {
        const pointer = input?.clearPointer
          ? undefined
          : input?.pointer ?? prev?.pointer
        const activity = resolvePresenceActivity(
          editor,
          input?.activity ?? (pointer ? 'pointing' : 'idle')
        )

        return {
          user: prev?.user ?? binding.user,
          pointer,
          selection: getSelectionSnapshot(editor),
          tool: serializePresenceTool(editor.store.tool.get()),
          activity,
          updatedAt: Date.now()
        }
      })
    }

    const publishPointer = (
      clientX: number,
      clientY: number,
      activity: 'pointing' | 'dragging'
    ) => {
      const container = containerRef.current
      if (!container) {
        return
      }

      const now = readNow()
      if (now - lastPointerPublishAtRef.current < POINTER_THROTTLE_MS) {
        return
      }
      lastPointerPublishAtRef.current = now

      const pointer = editor.read.viewport.pointer({
        clientX,
        clientY
      })

      syncPresence({
        pointer: {
          world: pointer.world,
          timestamp: Date.now()
        },
        activity
      })
    }

    const clearPresence = () => {
      syncPresence({
        clearPointer: true,
        activity: 'idle'
      })
    }

    syncPresence({
      clearPointer: true,
      activity: 'idle'
    })

    const unsubscribeSelection = editor.store.selection.subscribe(() => {
      syncPresence()
    })
    const unsubscribeTool = editor.store.tool.subscribe(() => {
      syncPresence()
    })
    const unsubscribeEdit = editor.store.edit.subscribe(() => {
      syncPresence()
    })

    const container = containerRef.current
    const onPointerDown = (event: PointerEvent) => {
      publishPointer(event.clientX, event.clientY, 'pointing')
    }
    const onPointerMove = (event: PointerEvent) => {
      publishPointer(
        event.clientX,
        event.clientY,
        event.buttons === 0 ? 'pointing' : 'dragging'
      )
    }
    const onPointerUp = (event: PointerEvent) => {
      publishPointer(event.clientX, event.clientY, 'pointing')
    }
    const onPointerCancel = () => {
      clearPresence()
    }
    const onPointerLeave = () => {
      clearPresence()
    }
    const onVisibilityChange = () => {
      if (globalThis.document.visibilityState !== 'visible') {
        clearPresence()
      }
    }

    if (container) {
      container.addEventListener('pointerdown', onPointerDown, true)
      container.addEventListener('pointermove', onPointerMove)
      container.addEventListener('pointerup', onPointerUp)
      container.addEventListener('pointercancel', onPointerCancel)
      container.addEventListener('pointerleave', onPointerLeave)
    }

    window.addEventListener('blur', clearPresence)
    globalThis.document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      unsubscribeSelection()
      unsubscribeTool()
      unsubscribeEdit()
      if (container) {
        container.removeEventListener('pointerdown', onPointerDown, true)
        container.removeEventListener('pointermove', onPointerMove)
        container.removeEventListener('pointerup', onPointerUp)
        container.removeEventListener('pointercancel', onPointerCancel)
        container.removeEventListener('pointerleave', onPointerLeave)
      }
      window.removeEventListener('blur', clearPresence)
      globalThis.document.removeEventListener('visibilitychange', onVisibilityChange)
      binding.setLocalState(null)
    }
  }, [collab?.presence?.binding, editor])

  return (
    <WhiteboardServicesProvider value={services}>
      <WhiteboardConfigProvider value={resolvedConfig}>
        <OverlayProvider>
          <Surface
            resolvedConfig={resolvedConfig}
            containerRef={containerRef}
            containerStyle={resolvedConfig.style}
            presenceBinding={collab?.presence?.binding}
          />
        </OverlayProvider>
      </WhiteboardConfigProvider>
    </WhiteboardServicesProvider>
  )
})

export const Whiteboard = WhiteboardInner
