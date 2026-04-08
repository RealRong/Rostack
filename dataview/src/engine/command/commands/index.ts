import type { DataDoc } from '@dataview/core/contracts/state'
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
  resolvePropertyReplaceSchemaCommand,
  resolvePropertyPutCommand,
  resolvePropertyRemoveCommand
} from '../field'
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
  resolveViewCalcSetCommand,
  resolveViewCreateCommand,
  resolveViewDisplayClearCommand,
  resolveViewDisplayHideCommand,
  resolveViewDisplayMoveCommand,
  resolveViewDisplayReplaceCommand,
  resolveViewDisplayShowCommand,
  resolveViewDuplicateCommand,
  resolveViewGallerySetCardSizeCommand,
  resolveViewGalleryLabelsSetCommand,
  resolveViewGroupBucketCollapseCommand,
  resolveViewGroupBucketExpandCommand,
  resolveViewGroupBucketHideCommand,
  resolveViewGroupBucketShowCommand,
  resolveViewGroupBucketToggleCollapseCommand,
  resolveViewGroupClearCommand,
  resolveViewGroupEmptySetCommand,
  resolveViewGroupIntervalSetCommand,
  resolveViewGroupModeSetCommand,
  resolveViewGroupSetCommand,
  resolveViewGroupSortSetCommand,
  resolveViewGroupToggleCommand,
  resolveViewKanbanFillColorSetCommand,
  resolveViewKanbanSetNewRecordPositionCommand,
  resolveViewFilterAddCommand,
  resolveViewFilterClearCommand,
  resolveViewFilterModeCommand,
  resolveViewFilterPresetCommand,
  resolveViewFilterRemoveCommand,
  resolveViewFilterSetCommand,
  resolveViewFilterValueCommand,
  resolveViewOrderClearCommand,
  resolveViewOrderMoveCommand,
  resolveViewOrderSetCommand,
  resolveViewPutCommand,
  resolveViewRenameCommand,
  resolveViewRemoveCommand,
  resolveViewSearchSetCommand,
  resolveViewSortAddCommand,
  resolveViewSortClearCommand,
  resolveViewSortMoveCommand,
  resolveViewSortOnlyCommand,
  resolveViewSortRemoveCommand,
  resolveViewSortReplaceCommand,
  resolveViewSortSetCommand,
  resolveViewTableVerticalLinesSetCommand,
  resolveViewTableSetWidthsCommand,
  resolveViewTypeSetCommand
} from './view'

export interface ResolvedCommand extends CommandResolution {}

export const resolveCommand = (document: DataDoc, command: IndexedCommand): ResolvedCommand => {
  switch (command.type) {
    case 'value.apply':
      return resolveValueApplyCommand(document, command)
    case 'record.create':
      return resolveRecordCreateCommand(document, command)
    case 'record.apply':
      return resolveRecordApplyCommand(document, command)
    case 'customField.create':
      return resolvePropertyCreateCommand(document, command)
    case 'customField.convert':
      return resolvePropertyConvertCommand(document, command)
    case 'customField.replaceSchema':
      return resolvePropertyReplaceSchemaCommand(document, command)
    case 'customField.duplicate':
      return resolvePropertyDuplicateCommand(document, command)
    case 'customField.put':
      return resolvePropertyPutCommand(document, command)
    case 'customField.patch':
      return resolvePropertyPatchCommand(document, command)
    case 'customField.option.create':
      return resolvePropertyOptionCreateCommand(document, command)
    case 'customField.option.reorder':
      return resolvePropertyOptionReorderCommand(document, command)
    case 'customField.option.update':
      return resolvePropertyOptionUpdateCommand(document, command)
    case 'customField.option.remove':
      return resolvePropertyOptionRemoveCommand(document, command)
    case 'customField.remove':
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
    case 'view.search.set':
      return resolveViewSearchSetCommand(document, command)
    case 'view.filter.add':
      return resolveViewFilterAddCommand(document, command)
    case 'view.filter.set':
      return resolveViewFilterSetCommand(document, command)
    case 'view.filter.preset':
      return resolveViewFilterPresetCommand(document, command)
    case 'view.filter.value':
      return resolveViewFilterValueCommand(document, command)
    case 'view.filter.mode':
      return resolveViewFilterModeCommand(document, command)
    case 'view.filter.remove':
      return resolveViewFilterRemoveCommand(document, command)
    case 'view.filter.clear':
      return resolveViewFilterClearCommand(document, command)
    case 'view.sort.add':
      return resolveViewSortAddCommand(document, command)
    case 'view.sort.set':
      return resolveViewSortSetCommand(document, command)
    case 'view.sort.only':
      return resolveViewSortOnlyCommand(document, command)
    case 'view.sort.replace':
      return resolveViewSortReplaceCommand(document, command)
    case 'view.sort.remove':
      return resolveViewSortRemoveCommand(document, command)
    case 'view.sort.move':
      return resolveViewSortMoveCommand(document, command)
    case 'view.sort.clear':
      return resolveViewSortClearCommand(document, command)
    case 'view.group.set':
      return resolveViewGroupSetCommand(document, command)
    case 'view.group.clear':
      return resolveViewGroupClearCommand(document, command)
    case 'view.group.toggle':
      return resolveViewGroupToggleCommand(document, command)
    case 'view.group.mode.set':
      return resolveViewGroupModeSetCommand(document, command)
    case 'view.group.sort.set':
      return resolveViewGroupSortSetCommand(document, command)
    case 'view.group.interval.set':
      return resolveViewGroupIntervalSetCommand(document, command)
    case 'view.group.empty.set':
      return resolveViewGroupEmptySetCommand(document, command)
    case 'view.group.bucket.show':
      return resolveViewGroupBucketShowCommand(document, command)
    case 'view.group.bucket.hide':
      return resolveViewGroupBucketHideCommand(document, command)
    case 'view.group.bucket.collapse':
      return resolveViewGroupBucketCollapseCommand(document, command)
    case 'view.group.bucket.expand':
      return resolveViewGroupBucketExpandCommand(document, command)
    case 'view.group.bucket.toggleCollapse':
      return resolveViewGroupBucketToggleCollapseCommand(document, command)
    case 'view.calc.set':
      return resolveViewCalcSetCommand(document, command)
    case 'view.display.replace':
      return resolveViewDisplayReplaceCommand(document, command)
    case 'view.display.move':
      return resolveViewDisplayMoveCommand(document, command)
    case 'view.display.show':
      return resolveViewDisplayShowCommand(document, command)
    case 'view.display.hide':
      return resolveViewDisplayHideCommand(document, command)
    case 'view.display.clear':
      return resolveViewDisplayClearCommand(document, command)
    case 'view.table.setWidths':
      return resolveViewTableSetWidthsCommand(document, command)
    case 'view.table.verticalLines.set':
      return resolveViewTableVerticalLinesSetCommand(document, command)
    case 'view.gallery.labels.set':
      return resolveViewGalleryLabelsSetCommand(document, command)
    case 'view.gallery.setCardSize':
      return resolveViewGallerySetCardSizeCommand(document, command)
    case 'view.kanban.setNewRecordPosition':
      return resolveViewKanbanSetNewRecordPositionCommand(document, command)
    case 'view.kanban.fillColor.set':
      return resolveViewKanbanFillColorSetCommand(document, command)
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
