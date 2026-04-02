import type {
  CoreRegistries,
  EdgeSchema,
  EdgeTypeDefinition,
  NodeSchema,
  NodeTypeDefinition,
  Registry,
  SchemaRegistry,
  Serializer
} from '../types'

const createRegistry = <T,>(getId: (definition: T) => string): Registry<T> => {
  const map = new Map<string, T>()
  return {
    get: (id) => map.get(id),
    list: () => Array.from(map.values()),
    register: (definition) => {
      const id = getId(definition)
      map.set(id, definition)
      return () => {
        if (map.get(id) === definition) {
          map.delete(id)
        }
      }
    },
    unregister: (id) => {
      map.delete(id)
    },
    has: (id) => map.has(id)
  }
}

const createSchemaRegistry = (): SchemaRegistry => {
  const nodeSchemas = new Map<string, NodeSchema>()
  const edgeSchemas = new Map<string, EdgeSchema>()
  return {
    registerNode: (schema) => {
      const key = schema.type
      nodeSchemas.set(key, schema)
      return () => {
        if (nodeSchemas.get(key) === schema) {
          nodeSchemas.delete(key)
        }
      }
    },
    registerEdge: (schema) => {
      const key = schema.type
      edgeSchemas.set(key, schema)
      return () => {
        if (edgeSchemas.get(key) === schema) {
          edgeSchemas.delete(key)
        }
      }
    },
    getNode: (type) => nodeSchemas.get(type),
    getEdge: (type) => edgeSchemas.get(type),
    listNodes: () => Array.from(nodeSchemas.values()),
    listEdges: () => Array.from(edgeSchemas.values())
  }
}

export const createRegistries = (): CoreRegistries => ({
  nodeTypes: createRegistry<NodeTypeDefinition>((definition) => definition.type),
  edgeTypes: createRegistry<EdgeTypeDefinition>((definition) => definition.type),
  schemas: createSchemaRegistry(),
  serializers: createRegistry<Serializer>((definition) => definition.type)
})
