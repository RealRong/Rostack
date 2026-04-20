# Dataview Field 第三阶段深度收敛方案

## 目标

这份文档只讨论：

- `dataview/packages/dataview-core/src/field`
- 下一轮还能怎么继续深度收敛
- 哪些复杂度是真复杂度
- 哪些复杂度只是同一套逻辑被拆成了多层重复模型

默认前提：

- 不考虑兼容成本
- 可以直接改 public API
- 不保留旧实现和中间兼容层
- 目标是长期复杂度最低，而不是局部最小改动

## 当前结论

`field` 还能继续明显收一轮，而且收益不小。

但下一轮不该继续围着 `field/index.ts` 做表面 API 调整，而应该直接把底层收成：

- 一张统一的 `fieldKindSpec`
- 所有 `kind / schema / spec / runtime / behavior` 都从这张 spec 投影出来

当前最大的问题不是函数名不统一，而是：

- 同一个 field kind 的行为，被三张表分别维护
- schema 规则和 runtime 规则是分裂的
- title 还是 runtime 特判，不是真正的内建 spec
- option 仍然有一层独立分派

## 静态扫描结果

这一轮只看 `dataview/packages/dataview-core/src/field`。

当前文件规模：

- `[field/kind/index.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/kind/index.ts)`: `1062` 行
- `[field/kind/date.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/kind/date.ts)`: `844` 行
- `[field/schema/index.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/schema/index.ts)`: `472` 行
- `[field/spec.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/spec.ts)`: `433` 行
- `[field/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/runtime.ts)`: `286` 行
- `[field/kind/spec.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/kind/spec.ts)`: `275` 行
- `[field/options/index.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/options/index.ts)`: `214` 行

总量不算离谱，问题在于重复分层：

1. `kind/spec.ts` 维护一张 kind create/convert/group spec 表
2. `kind/index.ts` 再维护一张 kind runtime 表
3. `spec.ts` 再维护一张 kind index/calculation/view spec 表
4. `schema/index.ts` 再按 kind 写两遍大 `switch`
5. `runtime.ts` 再做 title/custom 双轨分派

这说明 `field` 目前的复杂度核心不是“功能太多”，而是“同一类规则被多处重复组织”。

## 根问题

## 1. kind 模型被拆成三张表

当前有三层独立的按 kind 分派：

- `kindSpecs`
- `kindRuntime`
- `fieldSpecsByKind`

它们分别负责：

- create / convert / group 静态配置
- parse / display / search / compare / group entries
- index / calculation / create default / view

但这三类东西本质都属于：

- “这个 field kind 的能力定义”

也就是说，当前不是模型太少，而是模型太多。

## 2. schema 规则没有并回 kind

`[field/schema/index.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/schema/index.ts)` 里最重的部分不是通用逻辑，而是：

- `validateCustomFieldShape`
- `normalizeCustomField`

这两个函数都在做按 kind 的分派。

这说明 schema 规则还没有真正属于 kind 本身，而是被 schema 层重新解释了一遍。

## 3. title 不是统一 spec，只是 runtime 特判

`[field/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/runtime.ts)` 里有大量：

- `isTitleField(...) ? getKind('text') ... : ...`

这类逻辑说明 title 还没有变成：

- 一个统一接口下的内建 field spec

而只是 runtime 层的旁路分支。

## 4. option 仍然是第二套领域分派

现在 `field.option` 已经做了一轮 `spec / token / read / match / write` 收敛，这方向是对的。

但它依然存在一个问题：

- `options/index.ts`
- `options/spec.ts`

这两层都在关心 `select / multiSelect / status` 的差异。

这意味着 option 行为还没真正沉回 kind spec。

## 5. value 层还是薄包装

`[field/value/index.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/value/index.ts)`、
`[field/value/search.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/value/search.ts)`、
`[field/value/sort.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/value/sort.ts)` 基本都是薄转发。

这类文件可以保留 public owner，但内部不应该继续成为独立层。

## 第三阶段总原则

第三阶段只保留一条最重要的规则：

**field 的所有 kind 差异，只允许在一张统一的 `fieldKindSpec` 中定义。**

反过来说：

- 不允许 `kind/spec.ts` 一份
- `kind/index.ts` 再一份
- `spec.ts` 再一份
- `schema/index.ts` 再写两遍 switch

如果同一个差异点已经是 kind 差异，就必须回到 `fieldKindSpec`。

## 最终内部模型

推荐把底层统一成一张完整 spec 表：

```ts
interface FieldKindSpec {
  create: {
    default(input: {
      id: CustomFieldId
      name: string
      meta?: Record<string, unknown>
    }): CustomField
    convert(field: CustomField): CustomField
  }

  schema: {
    normalize(field: CustomField): CustomField
    validate(field: CustomField, path: string): readonly FieldSchemaValidationIssue[]
  }

  value: {
    display(field: FieldInput, value: unknown): string | undefined
    parse(field: FieldInput, draft: string): FieldDraftParseResult
    search(field: FieldInput, value: unknown): string[]
    compare(field: FieldInput, left: unknown, right: unknown): number
  }

  group: {
    modes: readonly string[]
    defaultMode: string
    sorts: readonly BucketSort[]
    defaultSort: BucketSort | ''
    showEmpty: boolean
    intervalModes?: readonly string[]
    defaultInterval?: number
    domain(field: FieldInput, mode: string): readonly Bucket[]
    entries(
      field: FieldInput,
      value: unknown,
      mode: string,
      interval?: number
    ): readonly Bucket[]
  }

  index: {
    searchDefaultEnabled: boolean
    bucketKeys?(value: unknown): readonly string[] | undefined
    sortScalar?(value: unknown): string | number | boolean | undefined
  }

  calculation: {
    uniqueKey(field: FieldInput, value: unknown): string
    optionIds?(field: FieldInput, value: unknown): readonly string[] | undefined
  }

  view: {
    groupUsesOptionColors: boolean
    kanbanGroupPriority: number
  }

  behavior: {
    canQuickToggle: boolean
    toggle?(value: unknown): unknown | undefined
  }
}
```

注意这里的重点不是 interface 名字，而是职责归并：

- `create`
- `schema`
- `value`
- `group`
- `index`
- `calculation`
- `view`
- `behavior`

每个 interface 内部按职责拆，不再让职责跨文件漂移。

## title 的处理

title 不应该继续在 `runtime.ts` 特判。

推荐补一个内建 title spec：

```ts
interface BuiltinFieldSpec {
  title: {
    value: ...
    group: ...
    behavior: ...
    index: ...
    calculation: ...
    view: ...
  }
}
```

然后统一通过：

```ts
fieldSpec.read(field)
```

拿到：

- title spec
- custom kind spec

这样以后：

- `fieldRuntime`
- `field.compare`
- `field.search`
- `field.group`

都不需要自己知道 “title 走 text 兜底” 这件事。

## 最终 public API

第三阶段不建议再大改顶层 `field` owner。

顶层保持：

```ts
export const field = {
  id,
  kind,
  create,
  schema,
  value,
  compare,
  search,
  group,
  display,
  draft,
  behavior,
  spec,
  option,
  date,
  status
}
```

但内部语义要稳定成下面这种投影关系。

## 1. `field.kind`

只保留 kind 身份相关能力：

```ts
field.kind.get(kind)
field.kind.isTitle(field)
field.kind.isCustom(field)
field.kind.hasOptions(field)
field.kind.convert(field, kind)
```

不再让 `field.kind` 同时承担 runtime 行为表的职责。

## 2. `field.schema`

只保留 schema owner：

```ts
field.schema.normalize(fields)
field.schema.validate(field, path)
field.schema.key.create(value)
field.schema.name.unique(baseName, fields)
field.schema.kind.isCustom(value)
```

内部的 per-kind normalize / validate 统一走 `fieldKindSpec.schema.*`。

## 3. `field.spec`

`field.spec` 变成唯一底层入口：

```ts
field.spec.get(kind)
field.spec.read(field)

field.spec.value.display(field, value)
field.spec.value.parse(field, draft)
field.spec.value.search(field, value)
field.spec.value.compare(field, left, right)

field.spec.group.meta(field, group?)
field.spec.group.domain(field, group?)
field.spec.group.entries(field, value, group?)

field.spec.index.searchDefaultEnabled(field)
field.spec.index.bucket.keys(field, value)
field.spec.index.sort.of(field)
field.spec.index.sort.scalar(field, value)

field.spec.calculation.uniqueKey(field, value)
field.spec.calculation.optionIds(field, value)

field.spec.behavior.quickToggle(field)
field.spec.behavior.toggle(field, value)
```

这里不是说业务方都直接调 `field.spec.*`，而是：

- 上层 API 必须统一投影到它

## 4. `field.value / compare / search / group / display / draft / behavior`

这些模块对外可以继续保留，但都只是对 `field.spec.*` 的语义投影：

```ts
field.value.read(record, fieldId)
field.value.empty(value)
field.value.number(value)
field.value.token(value)
field.value.searchable(value)

field.compare.value(field, left, right)
field.compare.sort(field, left, right, direction)

field.search.tokens(field, value)

field.group.meta(field, group?)
field.group.domain(field, group?)
field.group.entries(field, value, group?)

field.display.value(field, value)

field.draft.parse(field, draft)

field.behavior.quickToggle(field)
field.behavior.value({ exists, field })
field.behavior.primary({ exists, field, value })
```

注意：

- `field.value/search/sort` 不再保留独立实现层
- 只保留 owner 化 public 入口

## 5. `field.option`

`field.option` 可以继续保留现在的结构，但内部不再有第二套 kind 分派。

推荐最终形态：

```ts
field.option.spec.get(field)

field.option.token.normalize(value)
field.option.token.create(options, name)

field.option.read.list(field)
field.option.read.get(field, optionId)
field.option.read.find(field, value)
field.option.read.findByName(options, name)
field.option.read.tokens(field, optionId)
field.option.read.order(field, optionId)

field.option.match.equals(field, actual, expected)
field.option.match.contains(field, value, expected)

field.option.write.replace(field, options)
```

但 `options/spec.ts` 里的差异应下沉到：

- `fieldKindSpec.option`

或者直接并入：

- `fieldKindSpec.create`
- `fieldKindSpec.schema`

不再保留 option 自己再 dispatch 一层。

## 哪些文件应该消失

第三阶段完成后，推荐直接清掉这些中间层：

- `[field/value/search.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/value/search.ts)`
- `[field/value/sort.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/value/sort.ts)`

这两个文件价值太低，保留只会增加跳转层。

下面这些文件原则上也应该收薄：

- `[field/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/runtime.ts)`
- `[field/spec.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/spec.ts)`
- `[field/kind/spec.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/kind/spec.ts)`

其中至少一个应被整体合并掉，不能继续三份并存。

## 哪些文件应该保留，但职责收窄

- `[field/kind/date.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/kind/date.ts)`
- `[field/kind/status.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/kind/status.ts)`
- `[field/kind/url.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/kind/url.ts)`

这些文件的问题不是领域太强，而是挂接点太散。

它们应该保留为：

- 专有领域实现文件

但只通过统一 kind spec 暴露给上层。

## 最优实施顺序

## Phase 1. 合并三张 kind 表

目标：

- 合并 `kind/spec.ts`
- 合并 `kind/index.ts`
- 合并 `spec.ts` 中的 `fieldSpecsByKind`

产出：

- 单一 `fieldKindSpecByKind`
- 单一 `readFieldKindSpec(kind | field)`

完成标准：

- 不再存在三张按 kind 的独立配置表

## Phase 2. 把 schema 下沉到 kind spec

目标：

- `validateCustomFieldShape` 不再写整段大 `switch`
- `normalizeCustomField` 不再写整段大 `switch`

产出：

- `fieldKindSpec.schema.normalize`
- `fieldKindSpec.schema.validate`

完成标准：

- schema 层只保留通用流程和 table 级处理

## Phase 3. 消灭 title 双轨

目标：

- title 变成内建 spec
- `runtime.ts` 不再频繁 `getKind('text')`

完成标准：

- `field.spec.read(field)` 可以统一返回 title/custom spec

## Phase 4. 清掉 value 中间层

目标：

- 删除 `field/value/search.ts`
- 删除 `field/value/sort.ts`
- `field/value/index.ts` 只保留真正共性的 value helper

完成标准：

- `field.value` 不再只是转发壳的集合

## Phase 5. option 再下沉一层

目标：

- `options/spec.ts` 不再做第二套 kind dispatch
- option 差异回到 `fieldKindSpec`

完成标准：

- option 只保留 owner，不再保留独立的 spec 分派中心

## 实施 checklist

- [ ] 建立统一 `fieldKindSpec` interface，覆盖 create/schema/value/group/index/calculation/view/behavior
- [ ] 合并 `kind/spec.ts` 与 `kind/index.ts`
- [ ] 把 `spec.ts` 的 `fieldSpecsByKind` 合并进统一 spec
- [ ] 为 title 补内建 spec
- [ ] 删除 runtime 中对 title 的重复 text fallback
- [ ] 把 schema validate 的 per-kind switch 下沉到 spec
- [ ] 把 schema normalize 的 per-kind switch 下沉到 spec
- [ ] 删除 `field/value/search.ts`
- [ ] 删除 `field/value/sort.ts`
- [ ] 清理 `field/value/index.ts` 中对 `getKind/getFieldKind` 的依赖
- [ ] 把 option per-kind 特化回收到统一 spec
- [ ] 清理 engine/react 对旧中间层路径的引用
- [ ] 跑 `pnpm run typecheck:dataview`
- [ ] 跑 `pnpm run test:dataview`
- [ ] 回读 `field/index.ts`，确保只保留 owner 聚合，不再含多余实现含义

## 不建议做的事情

## 1. 不要把所有字段行为抽成超泛型动态对象

不推荐这种形式：

```ts
field.spec.run(field, 'compare', left, right)
field.spec.run(field, 'group.entries', value, group)
```

这种虽然短，但类型边界会迅速变差。

## 2. 不要把 date/status 再强行拆平

`date` 和 `status` 的复杂度大部分是真复杂度。

正确做法不是把它们抽薄，而是：

- 让它们只在一个挂接点接入统一 spec

## 3. 不要继续在 runtime 层叠 if/else

第三阶段的目标是减少 runtime 分派层，不是把更多逻辑塞进 `field/runtime.ts`。

## 最终判断

如果只回答“还能不能继续做一轮深度收敛”，答案是：

- 可以
- 而且值得做
- 但这轮必须改底层模型，而不是继续表面整理 API

第三阶段最重要的工作不是再改命名，而是把：

- `kind spec`
- `kind runtime`
- `field spec`
- `schema switch`

统一成一套单一 `fieldKindSpec`。

只要这一步做完，`field` 目录还会明显再降一层复杂度，而且以后新增 field kind 不会再同时改四个地方。
