import type { Document } from '@whiteboard/core/types'
import type { Facts } from '../contracts/document'
import { buildEntities } from './entities'
import { buildRelations } from './relations'

export const buildFacts = (
  document: Document
): Facts => ({
  entities: buildEntities(document),
  relations: buildRelations(document)
})
