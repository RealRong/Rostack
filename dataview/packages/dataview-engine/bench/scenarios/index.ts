import { STATUS_OPTIONS } from '@dataview/engine/bench/fixtures/index'

const scenario = (definition) => definition

const openView = (engine, viewId) => {
  engine.views.open(viewId)
  return engine.active
}

const addFilterRule = (active, fieldId, patch) => {
  const id = active.filters.create(fieldId)
  active.filters.patch(id, patch)
  return id
}

const setSingleSortRule = (active, fieldId, direction) => {
  active.sort.clear()
  return active.sort.create(fieldId, direction)
}

const SCENARIOS = [
  scenario({
    id: 'record.value.points.single',
    title: 'Single numeric value update',
    run: (engine, fixture) => {
      engine.records.fields.set(fixture.ids.target, fixture.fields.points, fixture.recordCount + 1)
    }
  }),
  scenario({
    id: 'record.value.points.bulk',
    title: 'Bulk numeric value update',
    run: (engine, fixture) => {
      engine.records.fields.writeMany({
        recordIds: fixture.ids.batch,
        set: {
          [fixture.fields.points]: fixture.recordCount + 1
        }
      })
    }
  }),
  scenario({
    id: 'record.value.status.grouped',
    title: 'Single group field update in grouped view',
    setup: (engine, fixture) => {
      openView(engine, fixture.viewId).group.set(fixture.fields.status)
    },
    run: (engine, fixture) => {
      engine.records.fields.set(fixture.ids.groupTarget, fixture.fields.status, STATUS_OPTIONS[2].id)
    }
  }),
  scenario({
    id: 'record.value.status.bulk.grouped',
    title: 'Bulk group field update in grouped view',
    setup: (engine, fixture) => {
      openView(engine, fixture.viewId).group.set(fixture.fields.status)
    },
    run: (engine, fixture) => {
      engine.records.fields.writeMany({
        recordIds: fixture.ids.batch,
        set: {
          [fixture.fields.status]: STATUS_OPTIONS[2].id
        }
      })
    }
  }),
  scenario({
    id: 'record.value.points.grouped.summary',
    title: 'Single summary field update in grouped summarized view',
    setup: (engine, fixture) => {
      openView(engine, fixture.viewId).group.set(fixture.fields.status)
      openView(engine, fixture.viewId).summary.set(fixture.fields.points, 'sum')
    },
    run: (engine, fixture) => {
      engine.records.fields.set(fixture.ids.target, fixture.fields.points, fixture.recordCount + 1)
    }
  }),
  scenario({
    id: 'record.value.points.bulk.grouped.summary',
    title: 'Bulk summary field update in grouped summarized view',
    setup: (engine, fixture) => {
      openView(engine, fixture.viewId).group.set(fixture.fields.status)
      openView(engine, fixture.viewId).summary.set(fixture.fields.points, 'sum')
    },
    run: (engine, fixture) => {
      engine.records.fields.writeMany({
        recordIds: fixture.ids.batch,
        set: {
          [fixture.fields.points]: fixture.recordCount + 1
        }
      })
    }
  }),
  scenario({
    id: 'view.query.search.set',
    title: 'Search query update',
    run: (engine, fixture) => {
      const query = fixture.ids.search.replace('rec_', 'Task ')
      openView(engine, fixture.viewId).search.set(query.replace('_', ' '))
    }
  }),
  scenario({
    id: 'view.query.filter.set',
    title: 'Filter value update',
    setup: (engine, fixture) => {
      addFilterRule(openView(engine, fixture.viewId), fixture.fields.status, {
        presetId: 'eq',
        value: { kind: 'option-set', optionIds: [] }
      })
    },
    run: (engine, fixture) => {
      const active = openView(engine, fixture.viewId)
      const filterId = active.view()?.filter.rules.order[0]
      if (!filterId) {
        throw new Error('Expected existing filter rule')
      }

      active.filters.patch(filterId, {
        presetId: 'eq',
        value: {
          kind: 'option-set',
          optionIds: [STATUS_OPTIONS[2].id]
        }
      })
    }
  }),
  scenario({
    id: 'view.query.sort.single',
    title: 'Sort rule update',
    run: (engine, fixture) => {
      setSingleSortRule(openView(engine, fixture.viewId), fixture.fields.points, 'desc')
    }
  }),
  scenario({
    id: 'view.query.group.set',
    title: 'Group rule update',
    run: (engine, fixture) => {
      openView(engine, fixture.viewId).group.set(fixture.fields.status)
    }
  }),
  scenario({
    id: 'history.undo.grouped.value',
    title: 'Undo after grouped value update',
    setup: (engine, fixture) => {
      openView(engine, fixture.viewId).group.set(fixture.fields.status)
      openView(engine, fixture.viewId).summary.set(fixture.fields.points, 'sum')
    },
    prepare: (engine, fixture) => {
      engine.records.fields.set(fixture.ids.groupTarget, fixture.fields.status, STATUS_OPTIONS[2].id)
    },
    run: engine => {
      engine.history.undo()
    }
  }),
  scenario({
    id: 'history.redo.grouped.value',
    title: 'Redo after grouped value update',
    setup: (engine, fixture) => {
      openView(engine, fixture.viewId).group.set(fixture.fields.status)
      openView(engine, fixture.viewId).summary.set(fixture.fields.points, 'sum')
    },
    prepare: (engine, fixture) => {
      engine.records.fields.set(fixture.ids.groupTarget, fixture.fields.status, STATUS_OPTIONS[2].id)
      engine.history.undo()
    },
    run: engine => {
      engine.history.redo()
    }
  })
]

const getScenarios = (requestedIds) => {
  if (!requestedIds?.length) {
    return SCENARIOS
  }

  const requested = new Set(requestedIds)
  return SCENARIOS.filter(item => requested.has(item.id))
}

export {
  SCENARIOS,
  getScenarios
}
