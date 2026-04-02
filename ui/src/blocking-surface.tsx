import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode
} from 'react'

export const BLOCKING_SURFACE_ATTR = 'data-ui-blocking-surface'
export const BLOCKING_SURFACE_BACKDROP_ATTR = 'data-ui-blocking-surface-backdrop'

export type BlockingSurfaceBackdrop = 'transparent' | 'dim'

export interface BlockingSurfaceState {
  id: string
  source: string
  backdrop: BlockingSurfaceBackdrop
  dismissOnBackdropPress: boolean
}

export interface OpenBlockingSurfaceInput extends BlockingSurfaceState {
  onDismiss?: () => void
}

export interface BlockingSurfaceController {
  setBlockingSurface: (input: OpenBlockingSurfaceInput) => void
  clearBlockingSurface: (id: string) => void
}

export const isBlockingSurfaceElement = (element: Element | null) => (
  Boolean(element?.closest(`[${BLOCKING_SURFACE_ATTR}]`))
)

const BlockingSurfaceContext = createContext<BlockingSurfaceController | null>(null)

export const BlockingSurfaceProvider = (props: {
  controller: BlockingSurfaceController | null
  children?: ReactNode
}) => (
  <BlockingSurfaceContext.Provider value={props.controller}>
    {props.children}
  </BlockingSurfaceContext.Provider>
)

export const useBlockingSurfaceController = () => (
  useContext(BlockingSurfaceContext)
)

export const useBlockingSurface = (input: {
  open: boolean
  source: string
  backdrop?: BlockingSurfaceBackdrop
  dismissOnBackdropPress?: boolean
  onDismiss?: () => void
}) => {
  const controller = useBlockingSurfaceController()
  const id = useId()
  const onDismissRef = useRef(input.onDismiss)
  const hasOnDismiss = Boolean(input.onDismiss)
  const dismiss = useCallback(() => {
    onDismissRef.current?.()
  }, [])

  useEffect(() => {
    onDismissRef.current = input.onDismiss
  }, [input.onDismiss])

  useEffect(() => {
    if (!controller || !input.open) {
      controller?.clearBlockingSurface(id)
      return
    }

    controller.setBlockingSurface({
      id,
      source: input.source,
      backdrop: input.backdrop ?? 'transparent',
      dismissOnBackdropPress: input.dismissOnBackdropPress ?? true,
      onDismiss: hasOnDismiss
        ? dismiss
        : undefined
    })

    return () => {
      controller.clearBlockingSurface(id)
    }
  }, [
    controller,
    dismiss,
    hasOnDismiss,
    id,
    input.backdrop,
    input.dismissOnBackdropPress,
    input.open,
    input.source
  ])

  return id
}
