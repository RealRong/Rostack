import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode
} from 'react'
import type {
  OpenBlockingSurfaceInput,
  BlockingSurfaceBackdrop
} from '@dataview/react/page/session/types'

export interface BlockingSurfaceController {
  setBlockingSurface: (input: OpenBlockingSurfaceInput) => void
  clearBlockingSurface: (id: string) => void
}

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
