import type {
  Document,
  Operation
} from '@whiteboard/core/types'
import * as Y from 'yjs'
import { replaceYjsDocument } from './materialize'

export const applyOperationsToYjsDocument = ({
  doc,
  operations: _operations,
  snapshot
}: {
  doc: Y.Doc
  operations: readonly Operation[]
  snapshot?: Document
}) => {
  if (!snapshot) {
    return
  }

  replaceYjsDocument(doc, snapshot)
}
