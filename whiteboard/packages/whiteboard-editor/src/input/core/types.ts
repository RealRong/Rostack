import type { ReadStore } from '@shared/core'
import type { ActiveGesture } from '@whiteboard/editor/input/gesture'
import type {
  KeyboardInput,
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput,
  WheelInput
} from '@whiteboard/editor/types/input'

type InteractionMode =
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
  gesture?: ActiveGesture | null
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
  mode: ReadStore<InteractionMode>
  busy: ReadStore<boolean>
  chrome: ReadStore<boolean>
  gesture: ReadStore<ActiveGesture | null>
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
