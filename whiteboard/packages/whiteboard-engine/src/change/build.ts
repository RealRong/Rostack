import type { ChangeSet } from '@whiteboard/core/types'
import type { Change } from '../contracts/document'
import { changeFromReduce } from './fromReduce'

export const buildChange = (
  changeSet: ChangeSet
): Change => changeFromReduce(changeSet)
