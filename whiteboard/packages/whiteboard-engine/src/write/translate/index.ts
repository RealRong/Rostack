import type { BoardConfig } from '@engine-types/instance'
import type {
  WriteCommandMap,
  WriteDomain,
  WriteInput,
  WriteOutput
} from '@engine-types/command'
import type { TranslateResult } from '@engine-types/internal/translate'
import type {
  CoreRegistries,
  Document,
  EdgeId,
  GroupId,
  MindmapId,
  MindmapNodeId,
  NodeId
} from '@whiteboard/core/types'
import { invalid } from './result'
import { translateDocument } from './document'
import { translateEdge } from './edge'
import { translateGroup } from './group'
import { translateMindmap } from './mindmap'
import { translateNode } from './node'

export type WriteTranslateContext = {
  doc: Document
  config: BoardConfig
  registries: CoreRegistries
  ids: {
    node: () => NodeId
    edge: () => EdgeId
    group: () => GroupId
    mindmap: () => MindmapId
    mindmapNode: () => MindmapNodeId
  }
}

export const translateWrite = <
  D extends WriteDomain,
  C extends WriteCommandMap[D]
>(
  payload: WriteInput<D, C>,
  ctx: WriteTranslateContext
): TranslateResult<WriteOutput<D, C>> => {
  switch (payload.domain) {
    case 'document':
      return translateDocument(payload.command as WriteCommandMap['document'], ctx) as TranslateResult<WriteOutput<D, C>>
    case 'node':
      return translateNode(payload.command as WriteCommandMap['node'], ctx) as TranslateResult<WriteOutput<D, C>>
    case 'group':
      return translateGroup(payload.command as WriteCommandMap['group'], ctx) as TranslateResult<WriteOutput<D, C>>
    case 'edge':
      return translateEdge(payload.command as WriteCommandMap['edge'], ctx) as TranslateResult<WriteOutput<D, C>>
    case 'mindmap':
      return translateMindmap(payload.command as WriteCommandMap['mindmap'], ctx) as TranslateResult<WriteOutput<D, C>>
    default:
      return invalid('Unsupported write action domain.') as TranslateResult<WriteOutput<D, C>>
  }
}
