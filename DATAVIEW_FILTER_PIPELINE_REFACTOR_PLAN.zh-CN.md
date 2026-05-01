# Dataview Filter Pipeline 全面重构方案

## 背景

当前 `dataview/packages/dataview-core/src/view/filter` 已经完成了一轮目录收拢和接口收敛，但内部运行时模型仍然保留了较重的“spec 对象分发”结构：

- 按 `field.kind` 解析 `FilterSpec`
- 再通过 `FilterSpec` 上的一组 callback 执行行为
- `plan` / `candidate` / `create` 继续拆成子 spec
- `buildFilterRuntimeSpec` / `buildSortedFilterRuntime` / `buildOptionBucketFilterRuntime` 负责拼装 callback 运行时
- `spec.table(filterSpec)` 再套一层 `string key -> spec object` 的运行时索引

这套模型的主要问题不是功能不对，而是执行路径过于间接：

1. 调用点需要先 resolve spec。
2. spec 内部再 resolve preset。
3. 各种行为再走 callback。
4. preset string 判断分散在多个 callback 和 helper 里。

结果是：

- 代码跳转层数多。
- 行为管线不直观。
- family 级别的共性没有被直接表达。
- `FilterSpec` 及其子 spec 成为历史兼容层，而不是必要的领域模型。

## 重构目标

将 filter 从“spec 对象分发模型”重构为“family config + 统一 rule pipeline”模型。

最终状态应满足：

- 不再依赖 `FilterSpec` callback object 作为主运行时抽象。
- 不再依赖 `FilterPlanSpec` / `FilterCandidateSpec` / `FilterCreateSpec` 这种二级 spec 拆分。
- 不再依赖 `buildFilterRuntimeSpec` 及其变体 builder。
- 不再依赖 `spec.table(filterSpec)` 作为主入口。
- 单条 filter rule 的所有语义行为通过共享 pipeline 执行。
- `rules.read / rules.write` 继续作为规则集合层保留。
- `state` 只负责整个 filter state。
- `rule` 只负责单条 rule 语义。

## 最终目录形态

建议最终形态：

- `dataview/packages/dataview-core/src/view/filter/index.ts`
- `dataview/packages/dataview-core/src/view/filter/rule.ts`
- `dataview/packages/dataview-core/src/view/filter/state.ts`
- `dataview/packages/dataview-core/src/view/filter/config.ts`
- `dataview/packages/dataview-core/src/view/filter/types.ts`

可选：

- `dataview/packages/dataview-core/src/view/filter/value.ts`

说明：

- `index.ts` 只做公开 API 组装。
- `rule.ts` 承载 rule pipeline。
- `state.ts` 承载 `state` 和 `rules.read / rules.write`。
- `config.ts` 承载静态 family / preset 配置。
- `types.ts` 只保留真正有必要的公开结构类型。
- 如果 `option-set` / `date` value normalize 投影逻辑仍然偏大，可以再拆 `value.ts`；否则直接并入 `rule.ts`。

## 推荐的 family 模型

当前 `field.kind` 不需要一对一映射完整运行时 spec，应该先映射到更稳定的 filter family。

建议 family：

- `text`
  - `title`
  - `text`
  - `url`
  - `email`
  - `phone`
- `comparable-number`
  - `number`
- `comparable-date`
  - `date`
- `single-option`
  - `select`
  - `status`
- `multi-option`
  - `multiSelect`
- `boolean`
  - `boolean`
- `presence`
  - `asset`

说明：

- `url` / `email` / `phone` 不需要独立 spec，它们只是 `text` family 的 field kind 别名。
- `select` / `status` 也不需要各自一整套 runtime，只需要共享 `single-option` family。
- `number` 和 `date` 都属于 comparable 路径，但因为 value normalize 和 default value 生成不同，建议拆成两个 family，而不是过度参数化。

## 最终运行时模型

### 1. family config

`config.ts` 只保存静态差异数据，不承载 callback 分发。

建议保留的数据：

- `family`
- `supportedPresets`
- `defaultPresetId`
- `editableValueKind`
- `planMode`
- `lookupMode`
- `defaultValueMode`

示意：

```ts
interface FilterFamilyConfig {
  family: FilterFamily
  defaultPresetId: FilterPresetId
  presets: readonly FilterPresetDef[]
  editableValueKind: 'none' | 'text' | 'number' | 'date' | 'option-set'
}

interface FilterPresetDef {
  id: FilterPresetId
  operator: FilterOperator
  valueMode: 'none' | 'fixed' | 'editable'
  fixedValue?: unknown
}
```

### 2. rule pipeline

`rule.ts` 提供共享语义管线，而不是一堆 callback object。

但这些 `resolve / get / derive` 步骤不应直接成为公开 API。它们属于内部流水线实现细节。

最终建议对外只保留：

- `createFilterRule(field, input)`
- `patchFilterRule(field, rule, patch)`
- `matchFilterRule(field, recordValue, rule)`
- `analyzeFilterRule(field, rule)`
- `sameFilterRule(left, right)`

其中：

- `create / patch / match / same` 是稳定语义能力。
- `analyze` 是统一只读分析入口。

内部仍然可以有：

1. `resolveFamily`
2. `resolvePreset`
3. `normalizeValue`

但这些只能留在 `rule.ts` 内部，不能进入公开导出面。

`analyze` 应统一承接当前分散的：

- `effective`
- `project`
- `plan`
- `bucketLookup`
- `sortLookup`
- `defaultValue`

但不再把它们并列暴露为一串独立 API。

### 3. state 和 rules collection

`state.ts` 保持现在已经收敛出的方向：

- `filter.state.clone`
- `filter.state.normalize`
- `filter.state.same`
- `filter.state.write.mode`
- `filter.rules.read.*`
- `filter.rules.write.*`

这里不再承载 rule 语义编排，只调用 `rule.ts` 中统一 pipeline。

## 必须删除的历史结构

以下结构在最终状态中应删除：

- `FilterSpec`
- `FilterPlanSpec`
- `FilterCandidateSpec`
- `FilterCreateSpec`
- `buildFilterRuntimeSpec`
- `buildSortedFilterRuntime`
- `buildOptionBucketFilterRuntime`
- `filterSpec`
- `filterSpecIndex`
- `getFilterSpec`

说明：

- 如果重构完成后仍保留这些名字，就说明仍然存在第二套运行时。
- 最终状态不能是“pipeline 新实现 + spec 旧实现并存”。

## 哪些现有逻辑应下沉为共享步骤

以下逻辑不应再散落在各 family callback 中，而应成为统一 pipeline 的共享步骤：

- `readExpectedValue`
- `createEditableValue`
- `normalizeEditableValue`
- `matchExistsValue`
- `matchComparableValue`
- `projectSingleValue`
- `projectOptionSetValue`
- `readSortedFilterLookup`

处理方式：

- 通用逻辑变成 pipeline 内部 shared step。
- family 差异通过 config 和少量 family-specific branch 表达。

## 哪些 string 分支应集中管理

当前散落的 preset string 分支应集中到 preset def 和 family 分支中：

- `'contains'`
- `'eq'`
- `'neq'`
- `'gt'`
- `'gte'`
- `'lt'`
- `'lte'`
- `'exists_true'`
- `'exists_false'`
- `'checked'`
- `'unchecked'`

原则：

- 这些 string 本身是领域枚举，可以保留。
- 但它们不应分散在多个 callback 和 helper 里重复判断。

## 推荐的最终 API 形态

最终 `filter` 对外建议保持：

```ts
filter.state.clone(...)
filter.state.normalize(...)
filter.state.same(...)
filter.state.write.mode(...)

filter.rule.same(...)
filter.rule.create(...)
filter.rule.patch(...)
filter.rule.match(...)
filter.rule.analyze(...)
filter.rule.presetIds(...)
filter.rule.hasPreset(...)

filter.rules.read.clone(...)
filter.rules.read.normalize(...)
filter.rules.read.same(...)
filter.rules.read.list(...)
filter.rules.read.get(...)
filter.rules.read.hasField(...)
filter.rules.read.assertFieldAvailable(...)

filter.rules.write.create(...)
filter.rules.write.insert(...)
filter.rules.write.patch(...)
filter.rules.write.move(...)
filter.rules.write.remove(...)
filter.rules.write.clear(...)
```

说明：

- `filter.rule.spec(...)` 应删除。
- `filter.rule.editorKind(...)` 可以保留，但更适合作为 `analyze` 的结果字段，而不是独立长期 API。
- `filter.plan.candidateLookup(...)` 不应长期保留，应该并入 `filter.rule.analyze(...).query`。

进一步收敛后，`filter.rule` 最终建议缩为：

```ts
filter.rule.same(...)
filter.rule.create(...)
filter.rule.patch(...)
filter.rule.match(...)
filter.rule.analyze(...)
filter.rule.presetIds(...)
filter.rule.hasPreset(...)
```

## analyze 的最终结果形态

`analyze` 不应原样暴露：

- `plan`
- `bucketLookup`
- `sortLookup`
- `defaultValue`

而应收敛为更高层的分析结果：

```ts
interface FilterRuleAnalysis {
  effective: boolean
  project: FilterValuePreview
  query: FilterQueryAnalysis
  recordDefault?: {
    fieldId: FieldId
    value: unknown
  }
}
```

其中：

```ts
type FilterQueryAnalysis =
  | { kind: 'scan' }
  | {
      kind: 'bucket'
      mode: 'include' | 'exclude'
      keys: readonly string[]
    }
  | {
      kind: 'sort'
      mode: 'exists' | 'eq' | 'gt' | 'gte' | 'lt' | 'lte'
      value?: unknown
    }
```

说明：

- `plan + bucketLookup + sortLookup` 全部并入 `query`。
- `defaultValue` 改名为 `recordDefault`，明确这是“给 record create 使用的派生值”，不是 rule 本体通用元数据。
- `effective` 和 `project` 可以保留为分析结果字段，因为它们比 lookup 细节稳定得多。

## 迁移步骤

### 阶段 1：建立 family config

- 新增 `config.ts`
- 引入 `FilterFamily`
- 建立 `field.kind -> family` 映射
- 建立 family 对应的 preset definitions

完成标准：

- 所有 preset 列表不再散落在 `spec.ts` 多个 runtime builder 旁边。

### 阶段 2：建立统一 rule pipeline

- 新增 `rule.ts`
- 将 `create / patch / match / same / analyze` 迁入
- 将 `resolveFamily / resolvePreset / normalizeValue` 收为内部 helper
- 将 `effective / project / demand / bucketLookup / sortLookup / defaultValue` 统一收敛到 `analyze`

完成标准：

- 单条 rule 所有语义行为可以不依赖 `FilterSpec` 执行。
- 外部不再看到一长串 `resolve / get / derive` 风格 API。

### 阶段 3：state 改为调用 pipeline

- `state.ts` 改为只做 table / order / uniqueness / collection write
- `rules.write.insert` 调 `rule.create`
- `rules.write.patch` 调 `rule.patch`

完成标准：

- `state.ts` 不再直接做 rule 语义判断。

### 阶段 4：删除 spec runtime

- 删除 `FilterSpec` 及其衍生 types
- 删除 `buildFilterRuntimeSpec`
- 删除 `buildSortedFilterRuntime`
- 删除 `buildOptionBucketFilterRuntime`
- 删除 `filterSpec` / `filterSpecIndex` / `getFilterSpec`

完成标准：

- 仓库内不存在 “先 resolve spec 再调用 callback” 的主流程。

### 阶段 5：收口 index API

- `index.ts` 改为只从 `rule.ts` / `state.ts` / `config.ts` 暴露最终 API
- 删除独立 `filter.plan`
- 将 query planning 统一并入 `filter.rule.analyze(...).query`

完成标准：

- `index.ts` 只做稳定 API 组装，不再承担兼容旧 spec 的转发。
- `filter.rule` 最终只暴露少量稳定语义 API，而不是公开内部流水线步骤。

## 需要特别避免的错误做法

- 不要保留 `FilterSpec` 作为兼容壳，再让 pipeline 从 `FilterSpec` 读数据。
- 不要新增另一套 builder 包住 family config。
- 不要把 family config 又做成 callback object。
- 不要让 `plan/candidate/create` 继续保留为三套并列子 spec。

这些做法都会导致第二套实现继续存在。

## 最终判断

这次重构的关键，不是把几个 helper 搬来搬去，而是：

- 删除 `spec object dispatch`
- 删除 `builder for callback object`
- 删除 `string key -> spec.table -> callback` 这条历史路径
- 用 `family config + shared pipeline` 直接替代

做到这一步之后，filter 才算真正从“规格化分发模型”进入“中轴化 rule pipeline 模型”。
