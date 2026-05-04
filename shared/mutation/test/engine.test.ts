import {
  describe,
  expect,
  test
} from 'vitest'
import {
  createMutationEngine,
  field,
  schema,
  sequence,
  writer
} from '../src/index'

const engineSchema = schema({
  title: field<string>(),
  tags: sequence<string>()
})

describe('createMutationEngine', () => {
  test('executes compile handlers with typed read/write/query/change/services', () => {
    const commits: string[] = []
    const watched: string[] = []
    const engine = createMutationEngine<
      typeof engineSchema,
      {
        type: 'rename'
        title: string
      },
      {
        suffix: string
      }
    >({
      schema: engineSchema,
      document: {
        title: 'base',
        tags: []
      },
      compile: {
        handlers: {
          rename(ctx) {
            expect(ctx.read.title()).toBe('base')
            expect(ctx.query.document.title).toBe('base')
            expect(ctx.change.title.changed()).toBe(false)

            ctx.write.title.set(`${ctx.intent.title}${ctx.services.suffix}`)
            ctx.write.tags.insert('compiled')

            expect(ctx.change.title.changed()).toBe(true)
            expect(ctx.change.tags.changed('compiled')).toBe(true)

            return {
              previous: ctx.read.title(),
              next: ctx.intent.title
            }
          }
        }
      },
      services: {
        suffix: '!'
      },
      history: true
    })

    const unsubscribe = engine.subscribe((commit) => {
      commits.push(commit.document.title)
    })
    const unwatch = engine.watch(
      (change) => change.title.changed(),
      (commit) => {
        watched.push(commit.document.title)
      }
    )

    const result = engine.execute({
      type: 'rename',
      title: 'next'
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({
        previous: 'base',
        next: 'next'
      })
      expect(result.commit.document).toEqual({
        title: 'next!',
        tags: ['compiled']
      })
      expect(result.commit.change.title.changed()).toBe(true)
      expect(result.commit.change.tags.changed('compiled')).toBe(true)
    }

    expect(engine.document()).toEqual({
      title: 'next!',
      tags: ['compiled']
    })
    expect(engine.history.state()).toEqual({
      undoDepth: 1,
      redoDepth: 0
    })
    expect(commits).toEqual(['next!'])
    expect(watched).toEqual(['next!'])

    unsubscribe()
    unwatch()
  })

  test('returns issues without applying writes when compile rejects the intent', () => {
    const engine = createMutationEngine<
      typeof engineSchema,
      {
        type: 'reject'
      }
    >({
      schema: engineSchema,
      document: {
        title: 'base',
        tags: []
      },
      compile: {
        handlers: {
          reject(ctx) {
            ctx.write.title.set('ignored')
            ctx.issue.add({
              code: 'blocked',
              message: 'blocked by compile'
            })
          }
        }
      }
    })

    const result = engine.execute({
      type: 'reject'
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual([{
        code: 'blocked',
        message: 'blocked by compile'
      }])
    }
    expect(engine.document()).toEqual({
      title: 'base',
      tags: []
    })
  })

  test('keeps apply unnormalized, normalizes replace, and replays history with change commits', () => {
    const normalizedTitles: string[] = []
    const commits: string[] = []
    const watched: string[] = []
    const engine = createMutationEngine({
      schema: engineSchema,
      document: {
        title: '  base  ',
        tags: []
      },
      normalize(document) {
        normalizedTitles.push(document.title)
        return {
          title: document.title.trim(),
          tags: [...document.tags].sort()
        }
      },
      history: true
    })

    const unsubscribe = engine.subscribe((commit) => {
      commits.push(commit.document.title)
    })
    const unwatch = engine.watch(
      (change) => change.title.changed(),
      (commit) => {
        watched.push(commit.document.title)
      }
    )

    expect(engine.document()).toEqual({
      title: 'base',
      tags: []
    })
    expect(normalizedTitles).toEqual(['  base  '])

    const writes = [] as import('../src').MutationWrite[]
    const write = writer(engineSchema, writes)
    write.title.set('  next  ')
    write.tags.replace(['z', 'a'])

    const applyCommit = engine.apply(writes)
    expect(applyCommit.document).toEqual({
      title: '  next  ',
      tags: ['z', 'a']
    })
    expect(normalizedTitles).toEqual(['  base  '])
    expect(engine.history.canUndo()).toBe(true)
    expect(applyCommit.change.title.changed()).toBe(true)

    const undoCommit = engine.history.undo()
    expect(undoCommit?.document).toEqual({
      title: 'base',
      tags: []
    })
    expect(undoCommit?.change.title.changed()).toBe(true)

    const redoCommit = engine.history.redo()
    expect(redoCommit?.document).toEqual({
      title: '  next  ',
      tags: ['z', 'a']
    })
    expect(redoCommit?.change.title.changed()).toBe(true)

    const replaceCommit = engine.replace({
      title: '  replaced  ',
      tags: ['b', 'a']
    })
    expect(replaceCommit.change.reset()).toBe(true)
    expect(replaceCommit.document).toEqual({
      title: 'replaced',
      tags: ['a', 'b']
    })
    expect(normalizedTitles).toEqual(['  base  ', '  replaced  '])
    expect(engine.history.state()).toEqual({
      undoDepth: 0,
      redoDepth: 0
    })
    expect(commits).toEqual([
      '  next  ',
      'base',
      '  next  ',
      'replaced'
    ])
    expect(watched).toEqual([
      '  next  ',
      'base',
      '  next  ',
      'replaced'
    ])

    unsubscribe()
    unwatch()
  })
})
