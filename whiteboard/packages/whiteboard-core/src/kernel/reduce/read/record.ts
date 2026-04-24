import { readRecordPath } from '../../../mutation/recordPath'

export const createReadRecordApi = () => ({
  path: (root: unknown, path: string): unknown => {
    return readRecordPath(root, path)
  }
})
