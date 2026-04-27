import { createRegistries } from '@whiteboard/core/registry/create'
import {
  schema
} from '@whiteboard/core/registry/schema'

export const registry = {
  create: createRegistries,
  schema
} as const

export {
  createRegistries,
  schema
}
