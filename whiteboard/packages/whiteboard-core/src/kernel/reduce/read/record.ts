import type { Path } from '@shared/mutation'
import { readRecordPath } from '../../../mutation/recordPath'

export const createReadRecordApi = () => ({
  path: (root: unknown, path: Path): unknown => {
    return readRecordPath(root, path)
  }
})
