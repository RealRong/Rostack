import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode
} from 'react'

export type OverlayCloseReason =
  | 'escape'
  | 'outside'
  | 'backdrop'
  | 'select'
  | 'back'
  | 'program'

export type OverlayLayerKind =
  | 'popover'
  | 'menu'
  | 'dialog'
  | 'picker'
  | 'custom'

export interface OverlayLayerOptions {
  id?: string
  kind: OverlayLayerKind
  parentId?: string | null
  modal?: boolean
  blocking?: boolean
  onClose?: (reason: OverlayCloseReason) => void
}

interface OverlayLayerRecord extends Required<Pick<OverlayLayerOptions, 'id' | 'kind' | 'parentId' | 'modal' | 'blocking'>> {
  onClose?: (reason: OverlayCloseReason) => void
  seq: number
}

export interface OverlayLayerHandle {
  id: string
  close: (reason: OverlayCloseReason) => boolean
  isTop: () => boolean
}

interface OverlayKeyHandlerOptions {
  layerId?: string
  order?: number
  when?: () => boolean
  onKeyDown: (event: KeyboardEvent, overlay: OverlayApi) => boolean | void
}

interface OverlayPointerHandlerOptions {
  layerId?: string
  order?: number
  when?: () => boolean
  onPointerDown: (event: PointerEvent, overlay: OverlayApi) => boolean | void
}

interface OverlayDismissHandlerOptions {
  layerId?: string
  order?: number
  when?: () => boolean
  onDismiss: (reason: OverlayCloseReason, overlay: OverlayApi) => boolean | void
}

type OverlayHandlerRecord<THandler extends {
  layerId?: string
  order?: number
  when?: (() => boolean) | undefined
}> = THandler & {
  id: string
  seq: number
}

export interface OverlayApi {
  topLayerId: string | null
  addLayer: (options: OverlayLayerOptions) => OverlayLayerHandle
  removeLayer: (id: string) => void
  updateLayer: (id: string, patch: Partial<OverlayLayerOptions>) => void
  isTopLayer: (id: string | null | undefined) => boolean
  closeTop: (reason: OverlayCloseReason) => boolean
  addKeyHandler: (handler: OverlayKeyHandlerOptions) => () => void
  addDismissHandler: (handler: OverlayDismissHandlerOptions) => () => void
  addPointerHandler: (handler: OverlayPointerHandlerOptions) => () => void
}

interface OverlayContextValue extends OverlayApi {
  closeLayer: (id: string, reason: OverlayCloseReason) => boolean
}

const OverlayContext = createContext<OverlayContextValue | null>(null)
const OverlayParentLayerContext = createContext<string | null>(null)

const requiresTopLayer = (reason: OverlayCloseReason) => (
  reason === 'escape'
  || reason === 'outside'
  || reason === 'backdrop'
  || reason === 'back'
)

const sortHandlers = <THandler extends {
  layerId?: string
  order?: number
  seq: number
}>(
  handlers: readonly THandler[],
  layers: readonly OverlayLayerRecord[]
) => {
  const layerOrder = new Map(
    layers.map((layer, index) => [layer.id, index] as const)
  )

  return [...handlers].sort((left, right) => {
    const orderDelta = (right.order ?? 0) - (left.order ?? 0)
    if (orderDelta !== 0) {
      return orderDelta
    }

    const leftLayerOrder = left.layerId
      ? (layerOrder.get(left.layerId) ?? -1)
      : -1
    const rightLayerOrder = right.layerId
      ? (layerOrder.get(right.layerId) ?? -1)
      : -1
    if (leftLayerOrder !== rightLayerOrder) {
      return rightLayerOrder - leftLayerOrder
    }

    return right.seq - left.seq
  })
}

const useLatestRef = <TValue,>(value: TValue) => {
  const ref = useRef(value)

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref
}

export const OverlayProvider = (props: {
  children?: ReactNode
}) => {
  const layerSequenceRef = useRef(0)
  const handlerSequenceRef = useRef(0)
  const [layers, setLayers] = useState<readonly OverlayLayerRecord[]>([])
  const layersRef = useLatestRef(layers)
  const keyHandlersRef = useRef<readonly OverlayHandlerRecord<OverlayKeyHandlerOptions>[]>([])
  const pointerHandlersRef = useRef<readonly OverlayHandlerRecord<OverlayPointerHandlerOptions>[]>([])
  const dismissHandlersRef = useRef<readonly OverlayHandlerRecord<OverlayDismissHandlerOptions>[]>([])

  const removeLayer = useCallback((id: string) => {
    setLayers(prev => (
      prev.some(layer => layer.id === id)
        ? prev.filter(layer => layer.id !== id)
        : prev
    ))
  }, [])

  const updateLayer = useCallback((id: string, patch: Partial<OverlayLayerOptions>) => {
    setLayers(prev => prev.map(layer => (
      layer.id === id
        ? {
            ...layer,
            ...(patch.kind ? { kind: patch.kind } : {}),
            ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
            ...(patch.modal !== undefined ? { modal: patch.modal } : {}),
            ...(patch.blocking !== undefined ? { blocking: patch.blocking } : {}),
            ...(patch.onClose !== undefined ? { onClose: patch.onClose } : {})
          }
        : layer
    )))
  }, [])

  const runDismissHandlers = useCallback((reason: OverlayCloseReason) => {
    const snapshot = sortHandlers(dismissHandlersRef.current, layersRef.current)

    for (const handler of snapshot) {
      if (handler.layerId && !layersRef.current.some(layer => layer.id === handler.layerId)) {
        continue
      }

      if (handler.when && !handler.when()) {
        continue
      }

      const handled = handler.onDismiss(reason, overlayApiRef.current)
      if (handled === true) {
        return true
      }
    }

    return false
  }, [layersRef])

  const closeLayer = useCallback((id: string, reason: OverlayCloseReason) => {
    const currentLayers = layersRef.current
    const layer = currentLayers.find(item => item.id === id)
    if (!layer) {
      return false
    }

    if (requiresTopLayer(reason) && currentLayers[currentLayers.length - 1]?.id !== id) {
      return false
    }

    if (runDismissHandlers(reason)) {
      return true
    }

    layer.onClose?.(reason)
    return true
  }, [layersRef, runDismissHandlers])

  const closeTop = useCallback((reason: OverlayCloseReason) => {
    const top = layersRef.current[layersRef.current.length - 1]
    if (!top) {
      return false
    }

    return closeLayer(top.id, reason)
  }, [closeLayer, layersRef])

  const addLayer = useCallback((options: OverlayLayerOptions) => {
    layerSequenceRef.current += 1
    const seq = layerSequenceRef.current
    const id = options.id ?? `overlay:${seq}`

    setLayers(prev => {
      const nextLayer: OverlayLayerRecord = {
        id,
        kind: options.kind,
        parentId: options.parentId ?? null,
        modal: options.modal ?? false,
        blocking: options.blocking ?? false,
        onClose: options.onClose,
        seq
      }
      const index = prev.findIndex(layer => layer.id === id)
      if (index === -1) {
        return [...prev, nextLayer]
      }

      const next = [...prev]
      next.splice(index, 1, nextLayer)
      return next
    })

    const handle: OverlayLayerHandle = {
      id,
      close: (reason: OverlayCloseReason) => closeLayer(id, reason),
      isTop: () => layersRef.current[layersRef.current.length - 1]?.id === id
    }
    return handle
  }, [closeLayer, layersRef])

  const isTopLayer = useCallback((id: string | null | undefined) => (
    Boolean(id) && layersRef.current[layersRef.current.length - 1]?.id === id
  ), [layersRef])

  const addHandler = useCallback(<THandler extends {
    layerId?: string
    order?: number
    when?: (() => boolean) | undefined
  }>(
    ref: MutableRefObject<readonly OverlayHandlerRecord<THandler>[]>,
    handler: THandler
  ) => {
    const id = `overlay-handler:${handlerSequenceRef.current += 1}`
    const record: OverlayHandlerRecord<THandler> = {
      ...handler,
      id,
      seq: handlerSequenceRef.current
    }

    ref.current = [...ref.current, record]

    return () => {
      ref.current = ref.current.filter(item => item.id !== id)
    }
  }, [])

  const overlayApi = useMemo<OverlayContextValue>(() => ({
    topLayerId: layers[layers.length - 1]?.id ?? null,
    addLayer,
    removeLayer,
    updateLayer,
    isTopLayer,
    closeTop,
    closeLayer,
    addKeyHandler: handler => addHandler(keyHandlersRef, handler),
    addDismissHandler: handler => addHandler(dismissHandlersRef, handler),
    addPointerHandler: handler => addHandler(pointerHandlersRef, handler)
  }), [addHandler, addLayer, closeLayer, closeTop, isTopLayer, layers, removeLayer, updateLayer])
  const overlayApiRef = useLatestRef<OverlayContextValue>(overlayApi)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const snapshot = sortHandlers(keyHandlersRef.current, layersRef.current)

      for (const handler of snapshot) {
        if (handler.layerId && !layersRef.current.some(layer => layer.id === handler.layerId)) {
          continue
        }

        if (handler.when && !handler.when()) {
          continue
        }

        const handled = handler.onKeyDown(event, overlayApiRef.current)
        if (handled === true || event.defaultPrevented) {
          return
        }
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      const snapshot = sortHandlers(pointerHandlersRef.current, layersRef.current)

      for (const handler of snapshot) {
        if (handler.layerId && !layersRef.current.some(layer => layer.id === handler.layerId)) {
          continue
        }

        if (handler.when && !handler.when()) {
          continue
        }

        const handled = handler.onPointerDown(event, overlayApiRef.current)
        if (handled === true || event.defaultPrevented) {
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown, true)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [layersRef, overlayApiRef])

  return (
    <OverlayContext.Provider value={overlayApi}>
      {props.children}
    </OverlayContext.Provider>
  )
}

export const useOverlay = (): OverlayApi => {
  const overlay = useContext(OverlayContext)
  if (!overlay) {
    throw new Error('useOverlay must be used within an OverlayProvider.')
  }

  return overlay
}

export const useOptionalOverlay = () => (
  useContext(OverlayContext)
)

export const useLayer = (input: {
  open: boolean
  id?: string
  kind: OverlayLayerKind
  parentId?: string | null
  modal?: boolean
  blocking?: boolean
  onClose?: (reason: OverlayCloseReason) => void
}): OverlayLayerHandle => {
  const overlay = useOptionalOverlay()
  const inheritedParentId = useContext(OverlayParentLayerContext)
  const generatedId = useId()
  const id = input.id ?? generatedId
  const closeRef = useLatestRef(input.onClose)

  useEffect(() => {
    if (!overlay || !input.open) {
      return
    }

    overlay.addLayer({
      id,
      kind: input.kind,
      parentId: input.parentId === undefined
        ? inheritedParentId
        : input.parentId,
      modal: input.modal,
      blocking: input.blocking,
      onClose: reason => closeRef.current?.(reason)
    })

    return () => {
      overlay.removeLayer(id)
    }
  }, [
    closeRef,
    id,
    inheritedParentId,
    input.blocking,
    input.kind,
    input.modal,
    input.open,
    input.parentId,
    overlay
  ])

  useEffect(() => {
    if (!overlay || !input.open) {
      return
    }

    overlay.updateLayer(id, {
      kind: input.kind,
      parentId: input.parentId === undefined
        ? inheritedParentId
        : input.parentId,
      modal: input.modal,
      blocking: input.blocking,
      onClose: reason => closeRef.current?.(reason)
    })
  }, [
    closeRef,
    id,
    inheritedParentId,
    input.blocking,
    input.kind,
    input.modal,
    input.open,
    input.parentId,
    overlay
  ])

  const close = useCallback((reason: OverlayCloseReason) => {
    if (overlay) {
      return overlay.closeLayer(id, reason)
    }

    closeRef.current?.(reason)
    return true
  }, [closeRef, id, overlay])

  const isTop = useCallback(() => (
    overlay
      ? overlay.isTopLayer(id)
      : true
  ), [id, overlay])

  return useMemo(() => ({
    id,
    close,
    isTop
  }), [close, id, isTop])
}

export const OverlayLayerProvider = (props: {
  layerId: string | null | undefined
  children?: ReactNode
}) => (
  <OverlayParentLayerContext.Provider value={props.layerId ?? null}>
    {props.children}
  </OverlayParentLayerContext.Provider>
)

export const useOverlayKey = (input: OverlayKeyHandlerOptions) => {
  const overlay = useOptionalOverlay()
  const handlerRef = useLatestRef(input)

  useEffect(() => {
    if (!overlay) {
      return
    }

    return overlay.addKeyHandler({
      layerId: input.layerId,
      order: input.order,
      when: () => handlerRef.current.when ? handlerRef.current.when() : true,
      onKeyDown: (event, api) => handlerRef.current.onKeyDown(event, api)
    })
  }, [input.layerId, input.order, overlay, handlerRef])
}

export const useOverlayPointer = (input: OverlayPointerHandlerOptions) => {
  const overlay = useOptionalOverlay()
  const handlerRef = useLatestRef(input)

  useEffect(() => {
    if (!overlay) {
      return
    }

    return overlay.addPointerHandler({
      layerId: input.layerId,
      order: input.order,
      when: () => handlerRef.current.when ? handlerRef.current.when() : true,
      onPointerDown: (event, api) => handlerRef.current.onPointerDown(event, api)
    })
  }, [input.layerId, input.order, overlay, handlerRef])
}

export const useOverlayDismiss = (input: OverlayDismissHandlerOptions) => {
  const overlay = useOptionalOverlay()
  const handlerRef = useLatestRef(input)

  useEffect(() => {
    if (!overlay) {
      return
    }

    return overlay.addDismissHandler({
      layerId: input.layerId,
      order: input.order,
      when: () => handlerRef.current.when ? handlerRef.current.when() : true,
      onDismiss: (reason, api) => handlerRef.current.onDismiss(reason, api)
    })
  }, [input.layerId, input.order, overlay, handlerRef])
}
