import { describe, expect, test } from 'vitest'
import { issueCollector } from '@shared/core'

describe('issueCollector', () => {
  test('collects issues and supports require', () => {
    const collector = issueCollector.createIssueCollector<'missing'>({
      source: {
        type: 'test'
      }
    })

    expect(collector.require(undefined, {
      code: 'missing',
      message: 'missing value'
    })).toBeUndefined()
    collector.add({
      code: 'missing',
      message: 'warning only',
      severity: 'warning'
    })

    expect(collector.hasErrors()).toBe(true)
    expect(collector.finish()).toEqual([
      {
        code: 'missing',
        message: 'missing value',
        severity: 'error',
        source: {
          type: 'test'
        }
      },
      {
        code: 'missing',
        message: 'warning only',
        severity: 'warning',
        source: {
          type: 'test'
        }
      }
    ])
  })

  test('supports fail-fast mode', () => {
    const collector = issueCollector.createIssueCollector<'invalid'>({
      mode: 'fail-fast'
    })

    expect(() => {
      collector.add({
        code: 'invalid',
        message: 'stop'
      })
    }).toThrow('stop')
  })
})
