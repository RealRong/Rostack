import type { ChangeSet } from '@whiteboard/core/types'
import type { EngineChange } from '../contracts/document'
import { changeFromReduce } from './fromReduce'

export const buildChange = (
  changeSet: ChangeSet
): EngineChange => changeFromReduce(changeSet)
