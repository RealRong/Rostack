import type { ReadStore } from '@whiteboard/engine'
import type {
  KeyboardInput,
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput,
  WheelInput
} from '../input'

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
  | 'edge-connect'
  | 'edge-route'

export type InteractionSessionMode = Exclude<InteractionMode, 'idle'>

export type InteractionState = Readonly<{
  busy: boolean
  chrome: boolean
  mode: InteractionMode
  transforming: boolean
}>

export type AutoPanPointer = Readonly<{
  clientX: number
  clientY: number
}>

export type InteractionKeyboardInput = KeyboardInput

export type InteractionControl = Readonly<{
  replace: (session: InteractionSession) => void
  pan: (pointer: AutoPanPointer) => void
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

export type AutoPanOptions = Readonly<{
  frame?: (pointer: AutoPanPointer) => InteractionSessionTransition | void
  threshold?: number
  maxSpeed?: number
}>

export type InteractionSession = {
  mode: InteractionSessionMode
  pointerId?: number
  chrome?: boolean
  autoPan?: AutoPanOptions
  move?: (input: PointerMoveInput) => InteractionSessionTransition | void
  up?: (input: PointerUpInput) => InteractionSessionTransition | void
  keydown?: (input: InteractionKeyboardInput) => InteractionSessionTransition | void
  keyup?: (input: InteractionKeyboardInput) => InteractionSessionTransition | void
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
    input: PointerDownInput,
    control: InteractionControl
  ) => InteractionStartResult
}

export type InteractionRuntime = {
  mode: ReadStore<InteractionMode>
  busy: ReadStore<boolean>
  chrome: ReadStore<boolean>
  state: ReadStore<InteractionState>
  handlePointerDown: (input: PointerDownInput) => boolean
  handlePointerMove: (input: PointerMoveInput) => boolean
  handlePointerUp: (input: PointerUpInput) => boolean
  handlePointerCancel: (input: {
    pointerId: number
  }) => boolean
  handlePointerLeave: () => void
  handleWheel: (input: WheelInput) => boolean
  cancel: () => void
  handleKeyDown: (input: InteractionKeyboardInput) => boolean
  handleKeyUp: (input: InteractionKeyboardInput) => boolean
  handleBlur: () => void
}
