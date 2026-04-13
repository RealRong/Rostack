import type { BoardConfig } from '#types/instance'
import type {
  CommandOutput,
  DocumentCommand,
  EdgeCommand,
  GroupCommand,
  MindmapCommand,
  NodeCommand,
  TranslateCommand
} from '#types/command'
import type { TranslateResult } from '#types/internal/translate'
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

export const translateWrite = <C extends TranslateCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<CommandOutput<C>> => {
  switch (command.type) {
    case 'document.insert':
    case 'document.delete':
    case 'document.duplicate':
    case 'document.background.set':
    case 'document.order':
      return translateDocument(command as DocumentCommand, ctx) as TranslateResult<CommandOutput<C>>
    case 'node.create':
    case 'node.move':
    case 'node.patch':
    case 'node.align':
    case 'node.distribute':
    case 'node.delete':
    case 'node.deleteCascade':
    case 'node.duplicate':
      return translateNode(command as NodeCommand, ctx) as TranslateResult<CommandOutput<C>>
    case 'group.merge':
    case 'group.order':
    case 'group.ungroup':
    case 'group.ungroupMany':
      return translateGroup(command as GroupCommand, ctx) as TranslateResult<CommandOutput<C>>
    case 'edge.create':
    case 'edge.move':
    case 'edge.reconnect':
    case 'edge.patch':
    case 'edge.delete':
    case 'edge.route.insert':
    case 'edge.route.move':
    case 'edge.route.remove':
    case 'edge.route.clear':
      return translateEdge(command as EdgeCommand, ctx) as TranslateResult<CommandOutput<C>>
    case 'mindmap.create':
    case 'mindmap.delete':
    case 'mindmap.insert':
    case 'mindmap.move':
    case 'mindmap.remove':
    case 'mindmap.clone':
    case 'mindmap.patchNode':
      return translateMindmap(command as MindmapCommand, ctx) as TranslateResult<CommandOutput<C>>
    default:
      return invalid('Unsupported write action domain.') as TranslateResult<CommandOutput<C>>
  }
}
