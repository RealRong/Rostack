import type { DataDoc } from '@dataview/core/contracts'

export interface CreateInstanceDocumentOptions {
  initialDocument: DataDoc
}

export interface InstanceDocument {
  peekDocument: () => DataDoc
  installDocument: (document: DataDoc) => DataDoc
}

export const document = (options: CreateInstanceDocumentOptions): InstanceDocument => {
  let currentDocument = options.initialDocument

  const installDocument = (nextDocument: DataDoc) => {
    currentDocument = nextDocument
    return currentDocument
  }

  return {
    peekDocument: () => currentDocument,
    installDocument
  }
}
