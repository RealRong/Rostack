import type {
  NodeId
} from '@whiteboard/core/types'
import type { InteractionContext } from '../context'

export type EdgeInteractionCtx = Pick<
  InteractionContext,
  'read' | 'write' | 'config' | 'snap'
>

export type ConnectNodeEntry = NonNullable<
  ReturnType<EdgeInteractionCtx['read']['index']['node']['get']>
>
