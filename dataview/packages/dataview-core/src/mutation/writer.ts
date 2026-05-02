import type {
  MutationProgramWriter,
} from '@shared/mutation'
import {
  createMutationWriter,
} from '@shared/mutation'
import {
  dataviewMutationSchema,
  type DataviewMutationWriter,
} from './model'

export const createDataviewMutationWriter = (
  writer: MutationProgramWriter<string>
): DataviewMutationWriter => createMutationWriter(
  dataviewMutationSchema,
  writer
)
