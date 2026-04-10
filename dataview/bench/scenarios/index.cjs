const {
  STATUS_OPTIONS
} = require('../fixtures/index.cjs')

const scenario = (
  definition
) => definition

const SCENARIOS = [
  scenario({
    id: 'record.value.points.single',
    title: 'Single numeric value update',
    run: (engine, fixture) => {
      engine.records.setValue(fixture.ids.target, fixture.fields.points, fixture.recordCount + 1)
    }
  }),
  scenario({
    id: 'record.value.status.grouped',
    title: 'Single group field update in grouped view',
    setup: (engine, fixture) => {
      engine.view(fixture.viewId).group.set(fixture.fields.status)
    },
    run: (engine, fixture) => {
      engine.records.setValue(fixture.ids.groupTarget, fixture.fields.status, STATUS_OPTIONS[2].id)
    }
  }),
  scenario({
    id: 'record.value.points.grouped.calc',
    title: 'Single calc field update in grouped calculated view',
    setup: (engine, fixture) => {
      engine.view(fixture.viewId).group.set(fixture.fields.status)
      engine.view(fixture.viewId).calc.set(fixture.fields.points, 'sum')
    },
    run: (engine, fixture) => {
      engine.records.setValue(fixture.ids.target, fixture.fields.points, fixture.recordCount + 1)
    }
  }),
  scenario({
    id: 'view.query.search.set',
    title: 'Search query update',
    run: (engine, fixture) => {
      const query = fixture.ids.search.replace('rec_', 'Task ')
      engine.view(fixture.viewId).search.set(query.replace('_', ' '))
    }
  }),
  scenario({
    id: 'view.query.filter.set',
    title: 'Filter value update',
    setup: (engine, fixture) => {
      engine.view(fixture.viewId).filter.add(fixture.fields.status)
    },
    run: (engine, fixture) => {
      engine.view(fixture.viewId).filter.set(0, {
        fieldId: fixture.fields.status,
        presetId: 'eq',
        value: STATUS_OPTIONS[2].id
      })
    }
  }),
  scenario({
    id: 'view.query.sort.only',
    title: 'Sort rule update',
    run: (engine, fixture) => {
      engine.view(fixture.viewId).sort.only(fixture.fields.points, 'desc')
    }
  }),
  scenario({
    id: 'view.query.group.set',
    title: 'Group rule update',
    run: (engine, fixture) => {
      engine.view(fixture.viewId).group.set(fixture.fields.status)
    }
  }),
  scenario({
    id: 'history.undo.grouped.value',
    title: 'Undo after grouped value update',
    setup: (engine, fixture) => {
      engine.view(fixture.viewId).group.set(fixture.fields.status)
      engine.view(fixture.viewId).calc.set(fixture.fields.points, 'sum')
    },
    prepare: (engine, fixture) => {
      engine.records.setValue(fixture.ids.groupTarget, fixture.fields.status, STATUS_OPTIONS[2].id)
    },
    run: engine => {
      engine.history.undo()
    }
  }),
  scenario({
    id: 'history.redo.grouped.value',
    title: 'Redo after grouped value update',
    setup: (engine, fixture) => {
      engine.view(fixture.viewId).group.set(fixture.fields.status)
      engine.view(fixture.viewId).calc.set(fixture.fields.points, 'sum')
    },
    prepare: (engine, fixture) => {
      engine.records.setValue(fixture.ids.groupTarget, fixture.fields.status, STATUS_OPTIONS[2].id)
      engine.history.undo()
    },
    run: engine => {
      engine.history.redo()
    }
  })
]

const getScenarios = (
  requestedIds
) => {
  if (!requestedIds?.length) {
    return SCENARIOS
  }

  const requested = new Set(requestedIds)
  return SCENARIOS.filter(item => requested.has(item.id))
}

module.exports = {
  SCENARIOS,
  getScenarios
}
