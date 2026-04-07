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
import { createPortal } from 'react-dom'
import { closestTarget } from './dom'
import { cn } from './utils'

export const OVERLAY_LAYER_ATTR = 'data-ui-overlay-layer'
export const OVERLAY_BACKDROP_ATTR = 'data-ui-overlay-backdrop-for'
export const OVERLAY_BLOCKING_ATTR = 'data-ui-overlay-blocking'
export const OVERLAY_BLOCKING_BACKDROP_ATTR = 'data-ui-overlay-blocking-backdrop'

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

export type OverlayLayerMode =
  | 'floating'
  | 'modal'
  | 'blocking'

export type OverlayBackdrop =
  | 'none'
  | 'transparent'
  | 'dim'

export interface OverlayLayerOptions {
  id?: string
  kind: OverlayLayerKind
  parentId?: string | null
  portalRoot?: Element | null
  mode?: OverlayLayerMode
  modal?: boolean
  blocking?: boolean
  closeOnEscape?: boolean
  closeOnOutside?: boolean
  closeOnBackdrop?: boolean
  backdrop?: OverlayBackdrop
  onClose?: (reason: OverlayCloseReason) => void
}

interface OverlayLayerRecord extends Required<
  Pick<
    OverlayLayerOptions,
    | 'id'
    | 'kind'
    | 'parentId'
    | 'portalRoot'
    | 'mode'
    | 'closeOnEscape'
    | 'closeOnOutside'
    | 'closeOnBackdrop'
    | 'backdrop'
  >
> {
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
  hasBlockingLayer: boolean
  portalRoot: Element | null
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

const resolveLayerMode = (
  options: OverlayLayerOptions
): OverlayLayerMode => {
  if (options.mode) {
    return options.mode
  }

  if (options.blocking) {
    return 'blocking'
  }

  if (options.modal) {
    return 'modal'
  }

  return 'floating'
}

const collectAncestorIds = (
  layerId: string,
  layers: readonly OverlayLayerRecord[]
) => {
  const byId = new Map(layers.map(layer => [layer.id, layer] as const))
  const ancestors = new Set<string>()
  let current = byId.get(layerId) ?? null

  while (current) {
    if (ancestors.has(current.id)) {
      break
    }

    ancestors.add(current.id)
    current = current.parentId
      ? (byId.get(current.parentId) ?? null)
      : null
  }

  return ancestors
}

const collectDescendantIds = (
  layerId: string,
  layers: readonly OverlayLayerRecord[]
) => {
  const descendants = new Set<string>()
  const queue = [layerId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || descendants.has(currentId)) {
      continue
    }

    descendants.add(currentId)

    for (const layer of layers) {
      if (layer.parentId === currentId) {
        queue.push(layer.id)
      }
    }
  }

  return descendants
}

const isTargetWithinMenuChain = (input: {
  layerId: string
  ownerId: string
  layers: readonly OverlayLayerRecord[]
}) => {
  const byId = new Map(input.layers.map(layer => [layer.id, layer] as const))
  let current = byId.get(input.layerId) ?? null

  while (current) {
    if (current.id === input.ownerId) {
      return true
    }

    if (!current.parentId) {
      return false
    }

    const parent = byId.get(current.parentId) ?? null
    if (!parent || parent.kind !== 'menu') {
      return false
    }

    current = parent
  }

  return false
}

const isTargetWithinLayerOutsideContainment = (input: {
  layerId: string
  target: EventTarget | null
  layers: readonly OverlayLayerRecord[]
}) => {
  const owner = closestTarget(
    input.target,
    `[${OVERLAY_LAYER_ATTR}]`
  )?.getAttribute(OVERLAY_LAYER_ATTR)

  if (!owner) {
    return false
  }

  if (owner === input.layerId) {
    return true
  }

  const current = input.layers.find(layer => layer.id === input.layerId)
  if (!current) {
    return false
  }

  if (current.kind !== 'menu') {
    return false
  }

  return isTargetWithinMenuChain({
    layerId: input.layerId,
    ownerId: owner,
    layers: input.layers
  })
}

const topBlockingLayer = (
  layers: readonly OverlayLayerRecord[]
) => {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]
    if (layer?.mode === 'blocking') {
      return layer
    }
  }

  return null
}

export const isOverlayBlockingElement = (element: Element | null) => (
  Boolean(element?.closest(`[${OVERLAY_BLOCKING_ATTR}]`))
)

export const OverlayProvider = (props: {
  portalRoot?: Element | null
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
    setLayers(prev => {
      let changed = false

      const next = prev.map(layer => {
        if (layer.id !== id) {
          return layer
        }

        const merged: OverlayLayerOptions = {
          ...layer,
          ...patch
        }
        const nextLayer: OverlayLayerRecord = {
          id,
          kind: merged.kind,
          parentId: merged.parentId ?? null,
          portalRoot: merged.portalRoot ?? null,
          mode: resolveLayerMode(merged),
          closeOnEscape: merged.closeOnEscape ?? true,
          closeOnOutside: merged.closeOnOutside ?? true,
          closeOnBackdrop: merged.closeOnBackdrop ?? true,
          backdrop: merged.backdrop ?? 'none',
          onClose: merged.onClose,
          seq: layer.seq
        }

        if (
          nextLayer.kind !== layer.kind
          || nextLayer.parentId !== layer.parentId
          || nextLayer.portalRoot !== layer.portalRoot
          || nextLayer.mode !== layer.mode
          || nextLayer.closeOnEscape !== layer.closeOnEscape
          || nextLayer.closeOnOutside !== layer.closeOnOutside
          || nextLayer.closeOnBackdrop !== layer.closeOnBackdrop
          || nextLayer.backdrop !== layer.backdrop
          || nextLayer.onClose !== layer.onClose
        ) {
          changed = true
          return nextLayer
        }

        return layer
      })

      return changed
        ? next
        : prev
    })
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

    const top = currentLayers[currentLayers.length - 1]
    if (reason === 'backdrop') {
      if (topBlockingLayer(currentLayers)?.id !== id) {
        return false
      }
    } else if (requiresTopLayer(reason) && top?.id !== id) {
      return false
    }

    if (runDismissHandlers(reason)) {
      return true
    }

    layer.onClose?.(reason)
    return true
  }, [layersRef, runDismissHandlers])

  const closeBranch = useCallback((id: string, reason: OverlayCloseReason) => {
    const currentLayers = layersRef.current
    const layer = currentLayers.find(item => item.id === id)
    if (!layer) {
      return false
    }

    if (reason === 'backdrop') {
      if (topBlockingLayer(currentLayers)?.id !== id) {
        return false
      }
    } else if (requiresTopLayer(reason)) {
      const top = currentLayers[currentLayers.length - 1]
      const ancestorIds = collectAncestorIds(top?.id ?? '', currentLayers)
      if (!top || !ancestorIds.has(id)) {
        return false
      }
    }

    if (runDismissHandlers(reason)) {
      return true
    }

    const descendantIds = collectDescendantIds(id, currentLayers)
    const branch = currentLayers
      .filter(item => descendantIds.has(item.id))
      .sort((left, right) => right.seq - left.seq)

    for (const item of branch) {
      item.onClose?.(reason)
    }

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
        portalRoot: options.portalRoot ?? null,
        mode: resolveLayerMode(options),
        closeOnEscape: options.closeOnEscape ?? true,
        closeOnOutside: options.closeOnOutside ?? true,
        closeOnBackdrop: options.closeOnBackdrop ?? true,
        backdrop: options.backdrop ?? 'none',
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
    hasBlockingLayer: layers.some(layer => layer.mode === 'blocking'),
    portalRoot: props.portalRoot ?? null,
    addLayer,
    removeLayer,
    updateLayer,
    isTopLayer,
    closeTop,
    closeLayer,
    addKeyHandler: handler => addHandler(keyHandlersRef, handler),
    addDismissHandler: handler => addHandler(dismissHandlersRef, handler),
    addPointerHandler: handler => addHandler(pointerHandlersRef, handler)
  }), [addHandler, addLayer, closeLayer, closeTop, isTopLayer, layers, props.portalRoot, removeLayer, updateLayer])
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

      if (event.defaultPrevented || event.isComposing || event.key !== 'Escape') {
        return
      }

      const top = layersRef.current[layersRef.current.length - 1]
      if (!top || !top.closeOnEscape) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      closeLayer(top.id, 'escape')
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

      const target = event.target instanceof Element
        ? event.target
        : null
      if (!target) {
        return
      }

      const currentLayers = layersRef.current
      const currentTop = currentLayers[currentLayers.length - 1]
      if (!currentTop) {
        return
      }

      const blocking = topBlockingLayer(currentLayers)
      const backdropOwnerId = closestTarget(
        target,
        `[${OVERLAY_BACKDROP_ATTR}]`
      )?.getAttribute(OVERLAY_BACKDROP_ATTR)
      if (
        blocking
        && backdropOwnerId === blocking.id
      ) {
        if (blocking.closeOnBackdrop) {
          closeBranch(blocking.id, 'backdrop')
        }
        return
      }

      if (!currentTop.closeOnOutside) {
        return
      }

      if (isTargetWithinLayerOutsideContainment({
        layerId: currentTop.id,
        target,
        layers: currentLayers
      })) {
        return
      }

      closeLayer(currentTop.id, 'outside')
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown, true)

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [closeBranch, closeLayer, layersRef, overlayApiRef])

  const activeBlockingLayer = topBlockingLayer(layers)
  const backdropRoot = typeof document === 'undefined'
    ? null
    : (activeBlockingLayer?.portalRoot instanceof Element
        ? activeBlockingLayer.portalRoot
        : props.portalRoot instanceof Element
          ? props.portalRoot
        : document.body)
  const backdrop = activeBlockingLayer
    && activeBlockingLayer.backdrop !== 'none'
    && backdropRoot
    ? createPortal(
        <div
          aria-hidden="true"
          className={cn(
            'fixed inset-0 z-40',
            activeBlockingLayer.backdrop === 'dim' ? 'bg-overlay' : 'bg-transparent'
          )}
          {...{
            [OVERLAY_BACKDROP_ATTR]: activeBlockingLayer.id,
            [OVERLAY_BLOCKING_ATTR]: '',
            [OVERLAY_BLOCKING_BACKDROP_ATTR]: ''
          }}
          onPointerDown={event => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onMouseDown={event => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onContextMenu={event => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
          }}
        />,
        backdropRoot
      )
    : null

  return (
    <OverlayContext.Provider value={overlayApi}>
      {props.children}
      {backdrop}
    </OverlayContext.Provider>
  )
}

export const OverlayRoot = OverlayProvider

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

export const useOverlayLayerId = () => (
  useContext(OverlayParentLayerContext)
)

export const useLayer = (input: {
  open: boolean
  id?: string
  kind: OverlayLayerKind
  parentId?: string | null
  mode?: OverlayLayerMode
  modal?: boolean
  blocking?: boolean
  portalRoot?: Element | null
  closeOnEscape?: boolean
  closeOnOutside?: boolean
  closeOnBackdrop?: boolean
  backdrop?: OverlayBackdrop
  onClose?: (reason: OverlayCloseReason) => void
}): OverlayLayerHandle => {
  const overlay = useOptionalOverlay()
  const addLayer = overlay?.addLayer
  const removeLayer = overlay?.removeLayer
  const updateLayer = overlay?.updateLayer
  const closeLayer = overlay?.closeLayer
  const isTopLayer = overlay?.isTopLayer
  const inheritedParentId = useContext(OverlayParentLayerContext)
  const generatedId = useId()
  const id = input.id ?? generatedId
  const closeRef = useLatestRef(input.onClose)

  useEffect(() => {
    if (!addLayer || !removeLayer || !input.open) {
      return
    }

    addLayer({
      id,
      kind: input.kind,
      parentId: input.parentId === undefined
        ? inheritedParentId
        : input.parentId,
      mode: input.mode,
      modal: input.modal,
      blocking: input.blocking,
      portalRoot: input.portalRoot,
      closeOnEscape: input.closeOnEscape,
      closeOnOutside: input.closeOnOutside,
      closeOnBackdrop: input.closeOnBackdrop,
      backdrop: input.backdrop,
      onClose: reason => closeRef.current?.(reason)
    })

    return () => {
      removeLayer(id)
    }
  }, [
    addLayer,
    closeRef,
    id,
    inheritedParentId,
    input.backdrop,
    input.blocking,
    input.closeOnBackdrop,
    input.closeOnEscape,
    input.closeOnOutside,
    input.kind,
    input.modal,
    input.mode,
    input.open,
    input.parentId,
    input.portalRoot,
    removeLayer
  ])

  useEffect(() => {
    if (!updateLayer || !input.open) {
      return
    }

    updateLayer(id, {
      kind: input.kind,
      parentId: input.parentId === undefined
        ? inheritedParentId
        : input.parentId,
      mode: input.mode,
      modal: input.modal,
      blocking: input.blocking,
      portalRoot: input.portalRoot,
      closeOnEscape: input.closeOnEscape,
      closeOnOutside: input.closeOnOutside,
      closeOnBackdrop: input.closeOnBackdrop,
      backdrop: input.backdrop,
      onClose: reason => closeRef.current?.(reason)
    })
  }, [
    closeRef,
    id,
    inheritedParentId,
    input.backdrop,
    input.blocking,
    input.closeOnBackdrop,
    input.closeOnEscape,
    input.closeOnOutside,
    input.kind,
    input.modal,
    input.mode,
    input.open,
    input.parentId,
    input.portalRoot,
    updateLayer
  ])

  const close = useCallback((reason: OverlayCloseReason) => {
    if (closeLayer) {
      return closeLayer(id, reason)
    }

    closeRef.current?.(reason)
    return true
  }, [closeLayer, closeRef, id])

  const isTop = useCallback(() => (
    isTopLayer
      ? isTopLayer(id)
      : true
  ), [id, isTopLayer])

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
  const addKeyHandler = overlay?.addKeyHandler
  const handlerRef = useLatestRef(input)

  useEffect(() => {
    if (!addKeyHandler) {
      return
    }

    return addKeyHandler({
      layerId: input.layerId,
      order: input.order,
      when: () => handlerRef.current.when ? handlerRef.current.when() : true,
      onKeyDown: (event, api) => handlerRef.current.onKeyDown(event, api)
    })
  }, [addKeyHandler, handlerRef, input.layerId, input.order])
}

export const useOverlayPointer = (input: OverlayPointerHandlerOptions) => {
  const overlay = useOptionalOverlay()
  const addPointerHandler = overlay?.addPointerHandler
  const handlerRef = useLatestRef(input)

  useEffect(() => {
    if (!addPointerHandler) {
      return
    }

    return addPointerHandler({
      layerId: input.layerId,
      order: input.order,
      when: () => handlerRef.current.when ? handlerRef.current.when() : true,
      onPointerDown: (event, api) => handlerRef.current.onPointerDown(event, api)
    })
  }, [addPointerHandler, handlerRef, input.layerId, input.order])
}

export const useOverlayDismiss = (input: OverlayDismissHandlerOptions) => {
  const overlay = useOptionalOverlay()
  const addDismissHandler = overlay?.addDismissHandler
  const handlerRef = useLatestRef(input)

  useEffect(() => {
    if (!addDismissHandler) {
      return
    }

    return addDismissHandler({
      layerId: input.layerId,
      order: input.order,
      when: () => handlerRef.current.when ? handlerRef.current.when() : true,
      onDismiss: (reason, api) => handlerRef.current.onDismiss(reason, api)
    })
  }, [addDismissHandler, handlerRef, input.layerId, input.order])
}
