import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'

export type EdgeView = NonNullable<
  ReturnType<WhiteboardRuntime['read']['edge']['render']['get']>
>

export type EdgeResolved = EdgeView

export type EdgeState = EdgeView

export type SelectedEdgeChrome = NonNullable<
  ReturnType<WhiteboardRuntime['read']['edge']['selectedChrome']['get']>
>

export type SelectedEdgeRoutePoint = SelectedEdgeChrome['routePoints'][number]
