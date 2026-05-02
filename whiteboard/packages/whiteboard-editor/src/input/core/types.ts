import type {
  KeyboardInput,
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput,
  WheelInput
} from '@whiteboard/editor/api/input'

export type InteractionMode =
  | 'idle'
  | 'press'
  | 'draw'
  | 'viewport-pan'
  | 'marquee'
  | 'node-drag'
  | 'mindmap-drag'
  | 'node-transform'
  | 'edge-drag'
  | 'edge-label'
  | 'edge-connect'
  | 'edge-route'

type AutoPanPointer = Readonly<{
  clientX: number
  clientY: number
}>

export type PointerMode =
  | 'full'
  | 'point'

export type InteractionSessionTransition =
  | {
      kind: 'finish'
    }
  | {
      kind: 'cancel'
    }
  | {
      kind: 'replace'
      session: InteractionSession
    }

type AutoPanOptions = Readonly<{
  frame?: (pointer: AutoPanPointer) => InteractionSessionTransition | void
  threshold?: number
  maxSpeed?: number
}>

export type InteractionSession = {
  mode: Exclude<InteractionMode, 'idle'>
  pointerId?: number
  chrome?: boolean
  pointer?: {
    move?: PointerMode
    up?: PointerMode
  }
  attach?: (
    dispatch: (transition: InteractionSessionTransition) => void
  ) => void
  autoPan?: AutoPanOptions
  move?: (input: PointerMoveInput) => InteractionSessionTransition | void
  up?: (input: PointerUpInput) => InteractionSessionTransition | void
  keydown?: (input: KeyboardInput) => InteractionSessionTransition | void
  keyup?: (input: KeyboardInput) => InteractionSessionTransition | void
  blur?: () => InteractionSessionTransition | void
  cancel?: () => void
  cleanup?: () => void
}

export type InteractionStartResult =
  | null
  | 'handled'
  | InteractionSession

export type InteractionBinding = {
  key: string
  start?: (
    input: PointerDownInput
  ) => InteractionStartResult
}

export type InteractionRuntime = {
  pointerMode: (phase: 'move' | 'up') => PointerMode
  handlePointerDown: (input: PointerDownInput) => boolean
  handlePointerMove: (input: PointerMoveInput) => boolean
  handlePointerUp: (input: PointerUpInput) => boolean
  handlePointerCancel: (input: {
    pointerId: number
  }) => boolean
  handlePointerLeave: () => void
  handleWheel: (input: WheelInput) => boolean
  cancel: () => void
  handleKeyDown: (input: KeyboardInput) => boolean
  handleKeyUp: (input: KeyboardInput) => boolean
  handleBlur: () => void
}
