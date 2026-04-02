import type {
  NodeId
} from '@whiteboard/core/types'
import type { InteractionCtx } from '../../runtime/interaction/ctx'

export type EdgeInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write' | 'config' | 'snap'
>

export type ConnectNodeEntry = NonNullable<
  ReturnType<EdgeInteractionCtx['read']['index']['node']['get']>
>
