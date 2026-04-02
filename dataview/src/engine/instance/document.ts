import type { GroupDocument } from '@/core/contracts'

export interface GroupInstanceDocument {
  peekDocument: () => GroupDocument
  installDocument: (document: GroupDocument) => GroupDocument
}

export interface CreateInstanceDocumentOptions {
  initialDocument: GroupDocument
}

export const document = (options: CreateInstanceDocumentOptions): GroupInstanceDocument => {
  let currentDocument = options.initialDocument

  const installDocument = (nextDocument: GroupDocument) => {
    currentDocument = nextDocument
    return currentDocument
  }

  return {
    peekDocument: () => currentDocument,
    installDocument
  }
}
