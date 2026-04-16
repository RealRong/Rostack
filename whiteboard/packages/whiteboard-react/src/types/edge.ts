import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'

export type EdgeResolved = NonNullable<
  ReturnType<WhiteboardRuntime['read']['edge']['resolved']['get']>
>

export type EdgeState = EdgeResolved

export type EdgeView = NonNullable<
  ReturnType<WhiteboardRuntime['read']['edge']['view']['get']>
>

export type SelectedEdgeChrome = NonNullable<
  ReturnType<WhiteboardRuntime['read']['edge']['selectedChrome']['get']>
>

export type SelectedEdgeRoutePoint = SelectedEdgeChrome['routePoints'][number]
