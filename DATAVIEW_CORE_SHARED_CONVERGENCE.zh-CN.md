# Dataview Core 底层设施收敛方案

## 目标

这份文档只讨论：

- `dataview/packages/dataview-core`
- `shared/core`
- `read / compare / parse / sort` 相关能力还能如何继续下沉
- 哪些能力应该进入真正的共享层
- 哪些能力只适合沉淀为 dataview 内部共享层

默认前提：

- 不考虑兼容成本
- 可以直接改 public API
- 目标是长期复杂度最低，而不是局部文件更短
- 不因为“名字像 read / compare / parse / sort”就强行抽象

## 总结结论

还能继续明显收一轮，而且收益不小。

但最优方向不是把所有 `read / compare / parse / sort` 全都推到 `shared/core`，而是收成两层基础设施：

1. `shared/core`
   只放跨产品都成立的稳定通用能力
2. `dataview/packages/dataview-core/src/shared`
   只放 dataview 内部跨模块复用的领域能力

如果直接把 dataview 的领域值语义推进 `shared/core`，最后会得到：

- 名义上更“通用”
- 实际上更抽象
- 边界更模糊
- 未来更难维护

所以长期最优不是“全部共享”，而是“把共享边界划对”。

## 扫描范围

这轮重点扫了：

- `dataview/packages/dataview-core/src/field`
- `dataview/packages/dataview-core/src/filter`
- `dataview/packages/dataview-core/src/search`
- `dataview/packages/dataview-core/src/sort`
- `dataview/packages/dataview-core/src/document`
- `dataview/packages/dataview-core/src/view`
- `dataview/packages/dataview-core/src/calculation`
- `shared/core/src`

当前重复热点主要集中在：

- `dataview/packages/dataview-core/src/field/kind/spec.ts`
- `dataview/packages/dataview-core/src/field/spec.ts`
- `dataview/packages/dataview-core/src/field/kind/date.ts`
- `dataview/packages/dataview-core/src/filter/spec.ts`
- `dataview/packages/dataview-core/src/search/tokens.ts`
- `dataview/packages/dataview-core/src/document/table.ts`
- `dataview/packages/dataview-core/src/calculation/reducer.ts`

而当前 `shared/core` 已有能力主要只有：

- `string`
- `collection`
- `equality`
- `selection`
- `store`
- `scheduler`

这说明现在的核心问题不是“已经有共享层但没人用”，而是：

- 共享层缺少一批真正通用的值处理基础设施
- dataview-core 缺少一层自己的领域共享模块

## 根问题

## 1. 通用值处理基础设施缺位

`shared/core` 目前有：

- `trimToUndefined`
- `trimLowercase`
- `sameJsonValue`
- `sameOrder`
- `createOrderedKeyedCollection`

但没有：

- 通用值比较
- 通用稳定序列化
- 通用宽松解析
- 通用 ordered-id 变换
- 通用 object patch 判等

结果就是 dataview-core 里到处在业务文件里各自写：

- `comparePrimitive`
- `stableSerialize`
- `normalizeIds`
- `hasPatchChanges`
- `reorderXxxIds`

## 2. dataview 的领域共享层缺位

有些能力不是全仓通用，但在 dataview-core 内部又明显跨模块复用：

- option id 归一化
- search token 归一化
- field value 空值语义
- searchable value 展开

这些能力如果不集中，就会在：

- `field`
- `filter`
- `group`
- `search`

之间反复复制。

## 3. 现在的重复不是“相似”，而是“同一件事被重写”

已经确认的硬重复包括：

- `stableSerialize`
  - `calculation/reducer.ts`
  - `field/kind/spec.ts`
- `comparePrimitive`
  - `filter/spec.ts`
  - `field/kind/group.ts`
  - `field/kind/spec.ts`
- `normalizeOptionIds`
  - `filter/spec.ts`
  - `group/write.ts`
- trimmed string helper
  - `shared/core/src/string.ts`
  - `view/shared.ts`

这类不需要继续讨论，应该直接收口。

## 设计原则

## 1. 共享层只按“语义稳定性”划分，不按动词名划分

不要因为函数名叫：

- `readXxx`
- `parseXxx`
- `compareXxx`
- `sortXxx`

就把它们强行并进同一层。

真正应该判断的是：

- 这套语义是否跨产品稳定
- 是否不依赖 dataview 的值模型
- 是否未来还会在别的模块/产品里复用

## 2. `shared/core` 只放无 dataview 语义的能力

进入 `shared/core` 的能力必须满足：

- 不依赖 field kind
- 不依赖 filter/query/search 语义
- 不依赖 dataview 的 empty value 定义
- 不依赖 dataview 的 canonical date / option / bucket 规则

## 3. dataview 内部共享能力单独成层

不应该出现这种情况：

- 为了避免重复，把 dataview 专属语义塞进 `shared/core`
- 或者因为怕抽象过头，把明显重复逻辑继续散落在业务文件里

正确做法是补一层：

- `dataview/packages/dataview-core/src/shared`

## 最终分层

推荐把最终底层分成这三层：

### Layer 1: `shared/core`

适合放：

- compare
- json/object
- parse
- order/id-list
- 现有 string/collection/equality/store

### Layer 2: `dataview-core/src/shared`

适合放：

- dataview value 语义
- option value 语义
- search token 语义
- dataview-specific normalize helpers

### Layer 3: 业务 owner

保留：

- `field`
- `filter`
- `search`
- `group`
- `sort`
- `view`

这些模块只组装领域规则，不再自己发明底层工具。

## 哪些应该下沉到 `shared/core`

下面这些是跨产品稳定的底层能力，应该进入 `shared/core`。

## A. compare 设施

当前重复点：

- `filter/spec.ts` 的 `comparePrimitive`
- `field/kind/group.ts` 的 `comparePrimitive`
- `field/kind/spec.ts` 的 `comparePrimitive`
- `field/kind/group.ts` 的 `compareLabels`
- `field/kind/spec.ts` 的 `compareText`

推荐新增：

`shared/core/src/compare.ts`

```ts
export type Compare<T> = (left: T, right: T) => number

export const comparePrimitive: <T extends string | number | boolean>(
  left: T,
  right: T
) => number

export const compareNullableLast: <T>(
  left: T | null | undefined,
  right: T | null | undefined,
  compare: Compare<T>
) => number

export const createTextCompare: (options?: Intl.CollatorOptions) => Compare<string>

export const compareText: (
  left: string,
  right: string,
  options?: Intl.CollatorOptions
) => number

export const chainCompare: <T>(
  ...steps: readonly Compare<T>[]
) => Compare<T>
```

### 价值

- `field/kind/group.ts` 和 `field/kind/spec.ts` 可以共享同一套 compare
- `filter/spec.ts` 不再自己定义 `comparePrimitive`
- 后续 whiteboard 等模块如果也需要稳定 compare，也能直接复用

## B. json/object 设施

当前重复点：

- `calculation/reducer.ts` 的 `stableSerialize`
- `field/kind/spec.ts` 的 `stableSerialize`
- `view/shared.ts` 的 `isJsonObject`
- `document/table.ts` 的 `hasPatchChanges`
- `operation/executeOperation.ts` 的 `hasOwn`

推荐新增：

`shared/core/src/json.ts`

```ts
export type JsonObject = Record<string, unknown>

export const isPlainObject: (value: unknown) => value is Record<string, unknown>

export const isJsonObject: (value: unknown) => value is JsonObject

export const stableStringify: (value: unknown) => string

export const hasOwn: (
  value: Record<string, unknown>,
  key: string
) => boolean

export const readObjectKey: (
  value: unknown,
  key: string
) => unknown

export const hasPatchChanges: <T extends object>(
  current: T,
  patch: Partial<T>
) => boolean
```

### 价值

- `stableSerialize` 硬重复可以直接消掉
- `document/table.ts` 与其他 patch merge 场景可共享
- `view/shared.ts` 不再保留自己的 `isJsonObject`

## C. parse 设施

当前可抽通用能力：

- `field/kind/shared.ts` 的 `readLooseNumberDraft`
- `field/kind/shared.ts` 的 `readBooleanValue`
- `field/kind/shared.ts` 的 `readNumberValue`

推荐新增：

`shared/core/src/parse.ts`

```ts
export const readFiniteNumber: (
  value: unknown
) => number | undefined

export const readLooseNumber: (
  value: string
) => number | undefined

export const readBooleanLike: (
  value: unknown
) => boolean | undefined
```

### 价值

- 这些函数没有 dataview 特殊语义
- 名字和边界也比较稳定
- 以后别的产品也有很高概率复用

## D. ordered id list 设施

当前重复点和边界：

- `view/order.ts` 里的一组 ordered id 操作
- 很像通用 ordered collection 变换，不应只埋在 view 模块下

推荐新增：

`shared/core/src/order.ts`

```ts
export const normalizeExistingIds: <T>(
  ids: readonly T[] | undefined,
  valid: ReadonlySet<T>
) => T[]

export const applyPreferredOrder: <T>(
  ids: readonly T[],
  orderedIds: readonly T[]
) => T[]

export const moveItem: <T>(
  ids: readonly T[],
  target: T,
  options?: { before?: T }
) => T[]

export const moveBlock: <T>(
  ids: readonly T[],
  targets: readonly T[],
  options?: { before?: T }
) => T[]
```

### 价值

- `view/order.ts` 直接薄化
- 这类 ordered-list 变换未来在别的模块也容易复用

## 哪些只适合沉到 `dataview-core/src/shared`

下面这些明显跨 dataview 多模块复用，但不适合直接进 `shared/core`。

## A. option 语义

当前重复点：

- `filter/spec.ts` 的 `normalizeOptionIds`
- `group/write.ts` 的 `normalizeOptionIds`

推荐新增：

`dataview/packages/dataview-core/src/shared/option.ts`

```ts
export const normalizeOptionIds: (
  value: unknown
) => string[]

export const normalizeOptionIdList: (
  optionIds: readonly unknown[]
) => string[]
```

### 不进 `shared/core` 的原因

- 它已经带 dataview option value 语义
- 与 field option 模型强绑定
- 不是跨产品通用能力

## B. search token 语义

当前集中在：

- `search/tokens.ts`

推荐新增：

`dataview/packages/dataview-core/src/shared/searchTokens.ts`

```ts
export const SEARCH_TOKEN_SEPARATOR: string

export const normalizeToken: (
  value: unknown
) => string | undefined

export const normalizeTokens: (
  values: readonly string[]
) => readonly string[]

export const joinTokens: (
  values: readonly string[]
) => string | undefined

export const splitJoinedTokens: (
  value: string | undefined
) => readonly string[]

export const appendTokens: (
  target: Set<string>,
  values: readonly string[]
) => void
```

### 不进 `shared/core` 的原因

- `SEARCH_TOKEN_SEPARATOR` 是 dataview 搜索索引格式
- token 的 join/split 语义不是跨产品通用协议

## C. dataview value 语义

当前集中在：

- `field/kind/shared.ts`

建议保留在 dataview 内部共享层，未来可以重命名为：

`dataview/packages/dataview-core/src/shared/value.ts`

```ts
export type DraftParseResult =
  | { type: 'set'; value: unknown }
  | { type: 'clear' }
  | { type: 'invalid' }

export const isEmptyValue: (
  value: unknown
) => boolean

export const expandSearchableValue: (
  value: unknown
) => string[]
```

### 不进 `shared/core` 的原因

- `undefined/null/''/[]` 的空值定义是 dataview 自己的
- object 递归展开 searchable value 也是 dataview 搜索语义

## 明确不该下沉到 `shared/core` 的东西

## 1. date 领域规则

`field/kind/date.ts` 里的这些能力不应该进入 `shared/core`：

- canonical date string parse
- datetime parse
- floating datetime 语义
- timezone policy
- group key / group bucket start
- dataview date display 规则

这些都属于 dataview 的领域模型。

## 2. field kind compare / parse

`field/kind/spec.ts` 里的这些能力不应下沉到 `shared/core`：

- `compareNumberValues`
- `compareDateValues`
- `compareBooleanValues`
- `compareOptionValues`
- `parseNumberDraft`
- `parseDateDraft`
- `parseSingleOptionDraft`
- `parseMultiOptionDraft`

它们依赖：

- field kind
- option model
- date model
- dataview empty value 语义

## 3. filter 规则模型

`filter/spec.ts` 里的这些能力也不应进 `shared/core`：

- preset 选择
- expected value 推导
- filter match
- default value derive
- bucket lookup / sort lookup

这不是底层设施，而是 filter 领域规则。

## 4. state owner 的 clone / normalize / same 整体框架

`sort/state.ts`、`filter/state.ts`、`search/state.ts`、`view/state.ts` 确实有相似结构：

- `clone`
- `normalize`
- `same`
- `write`

但目前不建议直接抽成一个通用 state helper 框架。

原因：

- 看似相似，实际字段模型不同
- 一抽就会引入泛型协议和 adapter
- 代码量节省有限
- 抽象成本和认知成本更高

这类更适合保持 owner 清晰，而不是为了“模块化”硬抽。

## 当前最应该直接修掉的重复

下面这些不是“未来可以优化”，而是已经足够明确，应该直接收口。

## 1. `stableSerialize` 重复

位置：

- `calculation/reducer.ts`
- `field/kind/spec.ts`

动作：

- 下沉到 `shared/core/src/json.ts` 的 `stableStringify`

## 2. `comparePrimitive` / text compare 重复

位置：

- `filter/spec.ts`
- `field/kind/group.ts`
- `field/kind/spec.ts`

动作：

- 下沉到 `shared/core/src/compare.ts`

## 3. `normalizeOptionIds` 重复

位置：

- `filter/spec.ts`
- `group/write.ts`

动作：

- 下沉到 `dataview-core/src/shared/option.ts`

## 4. `sameFilterRule` 还在用 `JSON.stringify`

位置：

- `filter/state.ts`

问题：

- 与仓内其余地方的 `sameJsonValue` 语义不统一
- key 顺序和非 JSON 值的处理不稳定

动作：

- 改成统一基于 `sameJsonValue`

## 5. `toTrimmedString` 与 `trimToUndefined` 重复

位置：

- `view/shared.ts`
- `shared/core/src/string.ts`

动作：

- 删掉 dataview 自己的 `toTrimmedString`
- 统一用 `trimToUndefined`

## 6. `isJsonObject` / `isPlainObject` 边界不清

位置：

- `view/shared.ts`
- `shared/core`

动作：

- 在 `shared/core` 公开一个统一 object/json guard
- dataview 侧不再保留平行版本

## 最终 API 设计

## `shared/core`

```ts
// compare.ts
export type Compare<T> = (left: T, right: T) => number
export const comparePrimitive
export const compareNullableLast
export const compareText
export const createTextCompare
export const chainCompare

// json.ts
export type JsonObject = Record<string, unknown>
export const isPlainObject
export const isJsonObject
export const stableStringify
export const hasOwn
export const readObjectKey
export const hasPatchChanges

// parse.ts
export const readFiniteNumber
export const readLooseNumber
export const readBooleanLike

// order.ts
export const normalizeExistingIds
export const applyPreferredOrder
export const moveItem
export const moveBlock
```

## `dataview-core/src/shared`

```ts
// option.ts
export const normalizeOptionIds
export const normalizeOptionIdList

// searchTokens.ts
export const SEARCH_TOKEN_SEPARATOR
export const normalizeToken
export const appendTokens
export const normalizeTokens
export const joinTokens
export const splitJoinedTokens

// value.ts
export type DraftParseResult
export const isEmptyValue
export const expandSearchableValue
```

## 各模块的最终职责

## `field`

- 只负责 field kind spec 组装
- 不再自己维护通用 compare / stable stringify / parse primitive

## `filter`

- 只负责 filter 规则模型
- option normalize / primitive compare 由底层提供

## `search`

- 只负责 dataview 搜索流程
- token normalize/join/split 从 dataview shared 取

## `view`

- 只负责 view 结构和 owner
- ordered id 操作与 trimmed/object helper 不再自带

## `document`

- entity table 和 patch 行为走共享 object/order 设施
- 不再自己保留 patch diff 小工具

## 实施顺序

推荐严格按下面顺序实施，避免边改边扩散。

## Phase 1: 扩 `shared/core`

新增：

- `shared/core/src/compare.ts`
- `shared/core/src/json.ts`
- `shared/core/src/parse.ts`
- `shared/core/src/order.ts`

并在 `shared/core/src/index.ts` 导出。

## Phase 2: 补 `dataview-core/src/shared`

新增：

- `dataview/packages/dataview-core/src/shared/option.ts`
- `dataview/packages/dataview-core/src/shared/searchTokens.ts`
- `dataview/packages/dataview-core/src/shared/value.ts`
- `dataview/packages/dataview-core/src/shared/index.ts`

## Phase 3: 回收硬重复

优先改：

- `field/kind/spec.ts`
- `calculation/reducer.ts`
- `filter/spec.ts`
- `group/write.ts`
- `search/tokens.ts`
- `view/shared.ts`
- `document/table.ts`
- `operation/executeOperation.ts`
- `filter/state.ts`

## Phase 4: 清理命名

统一收口：

- `toTrimmedString` -> `trimToUndefined`
- 各种局部 `comparePrimitive` -> `comparePrimitive`
- `stableSerialize` -> `stableStringify`
- 各种局部 `normalizeOptionIds` -> `normalizeOptionIds`

## Phase 5: 删旧实现

要求：

- 不保留平行 helper
- 不保留旧别名
- 不保留“先转发再慢慢删”的兼容层

## 实施 checklist

- [ ] 为 `shared/core` 增加 `compare.ts`
- [ ] 为 `shared/core` 增加 `json.ts`
- [ ] 为 `shared/core` 增加 `parse.ts`
- [ ] 为 `shared/core` 增加 `order.ts`
- [ ] 更新 `shared/core/src/index.ts`
- [ ] 为 dataview-core 增加 `src/shared/option.ts`
- [ ] 为 dataview-core 增加 `src/shared/searchTokens.ts`
- [ ] 为 dataview-core 增加 `src/shared/value.ts`
- [ ] 更新 dataview-core shared 出口
- [ ] `field/kind/spec.ts` 改用共享 compare/json/parse
- [ ] `calculation/reducer.ts` 改用共享 `stableStringify`
- [ ] `filter/spec.ts` 改用共享 compare 和 option normalize
- [ ] `group/write.ts` 改用共享 option normalize
- [ ] `search/tokens.ts` 改用 dataview shared search token helper
- [ ] `view/shared.ts` 去掉 `toTrimmedString`
- [ ] `view/shared.ts` 去掉本地 `isJsonObject`
- [ ] `document/table.ts` 改用共享 `hasPatchChanges`
- [ ] `operation/executeOperation.ts` 改用共享 `hasOwn`
- [ ] `filter/state.ts` 改用 `sameJsonValue`
- [ ] 删除所有局部重复 helper
- [ ] 跑 `pnpm run typecheck:dataview`
- [ ] 跑 `pnpm run test:dataview`

## 非目标

这轮不建议做：

- 把 `field` / `filter` / `sort` / `search` 全抽成一个统一 DSL
- 把所有 state owner 抽成泛型 list state framework
- 把 date 领域逻辑推进 `shared/core`
- 把 dataview value empty/searchable 语义推进 `shared/core`

这些要么会过度抽象，要么会把边界做坏。

## 最终判断

下一轮最重要的不是继续改某一个业务模块，而是先补齐真正的底层设施。

如果底层设施不补：

- `field` 会继续重复 compare / stable serialize
- `filter` 会继续重复 value normalize / compare
- `search` 会继续重复 token normalize
- `view` / `document` 会继续各自带 object/order 小工具

如果底层设施补对：

- `shared/core` 会更像真正的基础库
- `dataview-core` 会少很多散 helper
- `field/filter/search/view/document` 的 owner 代码会明显变薄
- 整体复杂度会下降，而不是只是文件移动
