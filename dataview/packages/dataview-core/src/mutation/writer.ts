import type {
  MutationProgramWriter,
} from '@shared/mutation'
import {
  createMutationWriter,
} from '@shared/mutation'
import {
  dataviewMutationModel,
  type DataviewMutationWriter,
} from './model'

export const createDataviewMutationWriter = (
  writer: MutationProgramWriter<string>
): DataviewMutationWriter => createMutationWriter(
  dataviewMutationModel,
  writer
)
