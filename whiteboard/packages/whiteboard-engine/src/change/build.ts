import type { ChangeSet } from '@whiteboard/core/types'
import type { EngineDelta } from '../contracts/document'
import { changeFromReduce } from './fromReduce'

export const buildChange = (
  changeSet: ChangeSet
): EngineDelta => changeFromReduce(changeSet)
