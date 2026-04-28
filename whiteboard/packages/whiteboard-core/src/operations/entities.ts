import type {
  MutationEntitySpec
} from '@shared/mutation'

export const whiteboardEntities = {
  document: {
    kind: 'singleton',
    members: {
      id: 'field',
      name: 'field',
      background: 'field',
      canvas: 'record',
      meta: 'record'
    },
    change: {
      value: ['id', 'name', 'meta.**'],
      background: ['background'],
      canvasOrder: ['canvas.order']
    }
  },
  node: {
    kind: 'table',
    members: {
      type: 'field',
      position: 'field',
      size: 'field',
      rotation: 'field',
      groupId: 'field',
      owner: 'field',
      locked: 'field',
      data: 'record',
      style: 'record'
    },
    change: {
      geometry: ['position', 'size', 'rotation'],
      owner: ['groupId', 'owner'],
      content: ['type', 'locked', 'data.**', 'style.**']
    }
  },
  edge: {
    kind: 'table',
    members: {
      source: 'field',
      target: 'field',
      type: 'field',
      locked: 'field',
      groupId: 'field',
      textMode: 'field',
      route: 'record',
      style: 'record',
      labels: 'record',
      data: 'record'
    },
    change: {
      endpoints: ['source', 'target', 'type', 'locked', 'groupId', 'textMode'],
      route: ['route.**'],
      style: ['style.**'],
      labels: ['labels.**'],
      data: ['data.**']
    }
  },
  group: {
    kind: 'table',
    members: {
      locked: 'field',
      name: 'field'
    },
    change: {
      value: ['locked', 'name']
    }
  },
  mindmap: {
    kind: 'table',
    members: {
      root: 'field',
      members: 'record',
      children: 'record',
      layout: 'record',
      meta: 'record'
    },
    change: {
      structure: ['root', 'members.**', 'children.**'],
      layout: ['layout.**'],
      meta: ['meta.**']
    }
  }
} as const satisfies Readonly<Record<string, MutationEntitySpec>>

