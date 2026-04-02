import type { GroupDocument } from '@dataview/core/contracts/state'
import type { IndexedCommand } from '../context'
import { resolveExternalBumpCommand } from './external'
import {
  resolvePropertyConvertCommand,
  resolvePropertyCreateCommand,
  resolvePropertyDuplicateCommand,
  resolvePropertyOptionCreateCommand,
  resolvePropertyOptionRemoveCommand,
  resolvePropertyOptionReorderCommand,
  resolvePropertyOptionUpdateCommand,
  resolvePropertyPatchCommand,
  resolvePropertyPutCommand,
  resolvePropertyRemoveCommand
} from '../property'
import {
  resolveRecordCreateCommand,
  resolveRecordApplyCommand,
  resolveRecordInsertCommand,
  resolveRecordRemoveCommand
} from './record'
import type { CommandResolution } from './shared'
import {
  resolveValueApplyCommand
} from './value'
import {
  resolveViewAggregatesSetCommand,
  resolveViewCreateCommand,
  resolveViewDisplaySetPropertyIdsCommand,
  resolveViewDuplicateCommand,
  resolveViewGallerySetCardSizeCommand,
  resolveViewGallerySetShowPropertyLabelsCommand,
  resolveViewKanbanSetNewRecordPositionCommand,
  resolveViewOrderClearCommand,
  resolveViewOrderMoveCommand,
  resolveViewOrderSetCommand,
  resolveViewPutCommand,
  resolveViewQuerySetCommand,
  resolveViewRenameCommand,
  resolveViewRemoveCommand,
  resolveViewTableSetWidthsCommand,
  resolveViewTypeSetCommand
} from './view'

export interface ResolvedCommand extends CommandResolution {}

export const resolveCommand = (document: GroupDocument, command: IndexedCommand): ResolvedCommand => {
  switch (command.type) {
    case 'value.apply':
      return resolveValueApplyCommand(document, command)
    case 'record.create':
      return resolveRecordCreateCommand(document, command)
    case 'record.apply':
      return resolveRecordApplyCommand(document, command)
    case 'property.create':
      return resolvePropertyCreateCommand(document, command)
    case 'property.convert':
      return resolvePropertyConvertCommand(document, command)
    case 'property.duplicate':
      return resolvePropertyDuplicateCommand(document, command)
    case 'property.put':
      return resolvePropertyPutCommand(document, command)
    case 'property.patch':
      return resolvePropertyPatchCommand(document, command)
    case 'property.option.create':
      return resolvePropertyOptionCreateCommand(document, command)
    case 'property.option.reorder':
      return resolvePropertyOptionReorderCommand(document, command)
    case 'property.option.update':
      return resolvePropertyOptionUpdateCommand(document, command)
    case 'property.option.remove':
      return resolvePropertyOptionRemoveCommand(document, command)
    case 'property.remove':
      return resolvePropertyRemoveCommand(document, command)
    case 'external.bumpVersion':
      return resolveExternalBumpCommand(document, command)
    case 'record.insertAt':
      return resolveRecordInsertCommand(document, command)
    case 'record.remove':
      return resolveRecordRemoveCommand(document, command)
    case 'view.create':
      return resolveViewCreateCommand(document, command)
    case 'view.duplicate':
      return resolveViewDuplicateCommand(document, command)
    case 'view.put':
      return resolveViewPutCommand(document, command)
    case 'view.rename':
      return resolveViewRenameCommand(document, command)
    case 'view.type.set':
      return resolveViewTypeSetCommand(document, command)
    case 'view.query.set':
      return resolveViewQuerySetCommand(document, command)
    case 'view.aggregates.set':
      return resolveViewAggregatesSetCommand(document, command)
    case 'view.display.setPropertyIds':
      return resolveViewDisplaySetPropertyIdsCommand(document, command)
    case 'view.table.setWidths':
      return resolveViewTableSetWidthsCommand(document, command)
    case 'view.gallery.setShowPropertyLabels':
      return resolveViewGallerySetShowPropertyLabelsCommand(document, command)
    case 'view.gallery.setCardSize':
      return resolveViewGallerySetCardSizeCommand(document, command)
    case 'view.kanban.setNewRecordPosition':
      return resolveViewKanbanSetNewRecordPositionCommand(document, command)
    case 'view.order.move':
      return resolveViewOrderMoveCommand(document, command)
    case 'view.order.clear':
      return resolveViewOrderClearCommand(document, command)
    case 'view.order.set':
      return resolveViewOrderSetCommand(document, command)
    case 'view.remove':
      return resolveViewRemoveCommand(document, command)
    default: {
      const unexpectedCommand: never = command
      throw new Error(`Unsupported command: ${unexpectedCommand}`)
    }
  }
}
