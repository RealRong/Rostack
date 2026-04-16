# Dataview 文本去引擎与国际化中轴最终方案

## 文档目标

本文针对 dataview 当前 table footer 统计异常、国际化分层混乱、engine/core/react/meta 多层同时产文案的问题，给出一份长期最优的最终方案。

目标不是修某一个 footer 组件，也不是继续在现有 `display` / `label` / `valueText` 之类的字段上继续打补丁。

目标是一次性回答下面这些长期问题：

1. 为什么 table footer 现在看起来很怪。
2. engine、core、meta、react 四层在文案和展示上的职责最终应该如何划分。
3. 如何建立一条足够简单、可复用、复杂度低的 i18n 中轴。
4. 如何让 engine 最终不再产出任何系统文本。
5. footer summary、filter、section、group、field 默认名、日期/布尔/空值这几类路径，最终应该如何统一到同一套基础设施上。
6. 如果一步到位完成，哪些旧实现必须删除，不留兼容。

本文默认：

- 不考虑兼容成本。
- 不保留旧 API。
- 优先长期最优。
- engine 内不保留系统文本。
- `@dataview/react` 直接采用 `react-i18next` / `i18next` 作为正式 i18n 方案。
- 领域 id 统一归 `core` 体系定义。

---

## 一句话结论

Dataview 最终不应该继续让 engine/core 产出 `display`、`label`、`fieldLabel`、`valueText` 这种 UI 文本字段。

最终应该收敛成一条唯一主线：

`语义 id / 结构化值 -> dataview-meta label registry -> react i18n adapter -> 最终文本或节点`

也就是说：

1. engine/core 只产出语义和结构化数据。
2. `dataview-meta` 只维护系统 label registry。
3. React 是唯一正式渲染层。
4. 所有 summary、filter、section、group、system value 都复用同一套中轴，而不是各自发明 `display` 字符串。

---

## 为什么 footer 现在很怪

问题分两层。

### 1. React footer 当前渲染本身就有明显错误

`dataview/packages/dataview-react/src/views/table/components/body/ColumnFooterBlock.tsx` 当前直接在一个 footer cell 内同时渲染：

- `result.metric`
- `result.display`

这会导致 UI 上出现类似：

- `countByOption`
- `percentByOption`
- 后面再拼一串已经被格式化好的字符串

这也是截图里 footer 看起来“不像正常产品文案”的直接原因。

### 2. 更深层的问题是 engine 已经提前产出了 UI 文本

`dataview/packages/dataview-engine/src/active/snapshot/summary/compute.ts` 当前在 engine 层做了下面这些事：

- 定义空态显示文本 `--`
- 用 `Intl.NumberFormat(undefined, ...)` 直接格式化数字
- 直接拼 percent 文本
- distribution 里直接拼 `label + number`
- option distribution 里直接把 option name / option id 写进 `label`

这意味着：

1. locale 已经在 engine 被锁死。
2. React 拿到的是“已经被渲染过的字符串”，而不是结构化语义数据。
3. footer 无法按视图类型做差异化排版。
4. 国际化无法统一收口。

所以 footer 怪，不是一个局部问题，而是整条展示路径分层错了。

---

## 根因分层

### 1. engine 文本泄漏

当前 engine 内存在大量系统文本泄漏，不只 summary 一条线。

代表问题：

- summary 直接产出 `display`
- filter projection 直接产出 `fieldLabel`、`valueText`
- root section 直接写死 `'All'`
- engine command 里直接 import meta 并 `renderMessage(...)`

这些都说明 engine 已经承担了它不该承担的展示职责。

### 2. core 也在产出系统展示文本

当前 core 不只是做领域逻辑，也在做：

- field value display
- boolean display
- date relative 文本
- date/group bucket title
- empty / checked / has value 这类系统值文本

这意味着“文本污染”不是只在 engine，core 也有同样问题。

### 3. react 层还有大量硬编码文本

当前 react 内部仍然存在：

- calculation menu 硬编码中文
- filter 文本硬编码英文
- date picker 等局部直接写死文本

这说明 React 也还没有收口到统一 i18n 中轴。

### 4. meta 当前只是半成品

`dataview-meta` 里已经有 message registry 雏形，但当前还有两个问题：

1. 它同时承担“定义 label”和“提前 render 字符串”两种职责。
2. 它的组织方式还偏 UI 页面对齐，不完全按领域语义对齐。

长期最优下，meta 应该只负责系统 label registry，而不是字符串渲染器。

---

## 设计原则

## 1. engine/core 不产系统文本

系统文本包括：

- 所有内置 label
- 所有 locale 相关格式化结果
- 所有空态/布尔/日期相对时间文本
- 所有 section / group / filter / summary 的系统展示文本

engine/core 可以保留的只有：

- 领域语义 id
- 结构化数值
- 用户数据本身

用户数据本身包括：

- `field.name`
- `option.name`
- record title
- 文档里真实存储的文本值

这些不是系统 i18n 文本，不能机械删除。

## 2. 只保留一条展示路径

任何展示输出都只能走下面这条路径：

1. 领域语义 id / 结构化值
2. meta registry 查 label
3. React `useTranslation()` + locale formatter
4. 最终字符串 / ReactNode

不允许再并行存在：

- engine `display`
- core `label`
- meta `renderMessage(...)`
- react 局部硬编码

## 3. 能复用现有语义 id 的地方，不再额外造 label helper

像下面这些本身已经是很好的中轴语义 id：

- `CalculationMetric`
- `FilterPresetId`
- `SortDirection`
- `DateGroupMode`
- `StatusCategory`
- `CustomFieldKind`
- `ViewType`

这些地方不应该再让 engine 额外产出 `label` 或 `labelKey`。

直接让 React 用这些 id 去 meta 取 label 即可。

## 3.1 领域 id 的最终归属

领域 id 必须统一归 `core` 体系定义。

这是本方案的硬约束。

原因如下：

1. 领域 id 是跨 `core`、`engine`、`meta`、`react` 的共享语义基础。
2. `meta` 的职责只是系统 label registry，不应拥有领域模型定义权。
3. `react` 的职责只是渲染，不应定义领域语义。
4. 只有 `core` 才是稳定领域模型的正确归属层。

最终规则如下：

- 跨层稳定、公开复用的领域 id，放在 `dataview/packages/dataview-core/src/contracts`
- 领域模块专属但仍属于领域语义的 id，放在 `dataview-core` 对应子模块
- `meta` 只做 `领域 id -> Label`
- `react` 只消费领域 id，不定义领域 id

### 领域 id 的文件组织原则

领域 id 不应该走两种极端：

1. 不应该完全散落且没有统一出口
2. 不应该集中到一个“总表式大文件”

长期最优是：

- 定义按领域分布
- 导出集中收口

也就是说：

1. id 的定义位置应尽量靠近其所属领域
2. 对外消费入口应统一从 `core` 的公共导出收口

这是本方案明确采用的文件组织原则。

### 为什么不能做单文件全集中

如果把所有领域 id 都放进一个文件，例如：

- `core/contracts/domain-ids.ts`

长期几乎一定会退化成新的垃圾桶。

问题包括：

1. calculation、filter、group、date、status、view 等无关概念会混在一起
2. 领域边界会逐渐变差
3. 小改动也会碰全局总表
4. 后续新增概念时，团队会习惯性继续往这个大文件里堆

所以本文明确不采用“单文件集中定义所有领域 id”的方案。

### 为什么也不能完全自由散落

如果完全按局部文件自由散落、又没有统一导出，则会出现：

1. engine / meta / react 的导入路径越来越碎
2. 很难回答某个 id 的权威定义位置在哪里
3. 查找、迁移、重构、文档化成本变高

所以本文也不采用“只有局部定义、没有统一出口”的方案。

### 最终推荐结构

最终采用：

- 定义按领域放置
- 导出按公共入口集中

例如：

```ts
dataview/packages/dataview-core/src/contracts/
  state.ts
  index.ts

dataview/packages/dataview-core/src/field/kind/
  date.ts
  status.ts
```

如果后续领域 id 增长较多，也可以进一步演进为“集中到目录，不集中到单文件”：

```ts
dataview/packages/dataview-core/src/contracts/
  ids/
    calculation.ts
    filter.ts
    sort.ts
    view.ts
  index.ts
```

这里的关键点是：

- 可以集中到目录
- 不应该集中到单文件

### 对外导出规则

无论内部定义放在哪里，对外都应通过稳定公共入口导出。

也就是说：

- 外部依赖统一从 `@dataview/core/contracts` 或 `@dataview/core` 读取
- 不鼓励 engine/meta/react 深入引用某个局部实现文件来拿领域 id

最终目标是：

1. 定义位置语义清晰
2. 外部消费入口统一稳定

代表性例子：

- `CalculationMetric`
- `FilterPresetId`
- `SortDirection`
- `StatusCategory`
- `CustomFieldKind`
- `ViewType`

这些应继续属于 `core/contracts`

而像：

- `DateGroupMode`

这种更局部的领域 id，可以属于 `core/field/kind/date`

如果未来需要跨更多层广泛复用，再提升到 `core/contracts`。

## 4. system value 只保留语义 id，不直接暴露翻译 key

即便 engine “最多有个 key”，长期最优也不应该让 engine 直接暴露 i18n key 字符串，例如：

- `'meta.section.system.all'`

更合理的做法是暴露语义 id，例如：

- `'section.all'`

然后由 `dataview-meta` 把语义 id 映射到翻译 key。

这样 engine 不依赖翻译 key 命名约定，耦合更低。

## 5. 不再在 contract 里混入 `display` 风格字段

任何 contract 里只要出现这些字段，都应视为架构异味：

- `display`
- `label`
- `fieldLabel`
- `valueText`
- `title: string` 且其本质是系统值

长期最优不是继续给这些字段补更多语义，而是直接删除它们，改为结构化值。

---

## 最终中轴

最终建议只保留三块最小基础设施：

1. `Label`
2. `ValueToken`
3. 根级 `shared/i18n`

这三者分别解决：

1. 系统文案映射
2. 结构化展示值表达
3. 宿主语言环境与 React 渲染适配

其中一个重要结论是：

- `Label` 和 `ValueToken` 都应该上提到根级 `shared/i18n`
- dataview 不再持有自己的基础展示类型
- dataview 真正特殊的只剩领域 id、翻译 key / 文案、以及少量 dataview resolver

---

## 1. `Label`

`Label` 是整个仓库共享的系统文案描述对象。

建议直接替换当前概念：

- `MessageSpec` -> `Label`
- `message()` -> `label()`

最终形态可以保持极简：

```ts
export interface Label {
  key: string
  fallback: string
  values?: Record<string, unknown>
}
```

说明：

- `key` 是 i18n key。
- `fallback` 是开发期默认文本。
- `values` 是可选插值参数。

这里保留 `values` 是合理的，因为这能让 `t(label)` 保持足够简单。

但有一条硬约束：

- `Label` 只能被 render 层消费。
- engine/core 不允许调用它。

### Label 的最终归属

长期最优下，`Label` 不应继续定义在 `dataview-meta`，而应定义在根级 `shared/i18n`。

`dataview-meta` 只是 dataview 自己的 registry，负责输出 dataview 领域用到的 `Label`。

### meta 的最终职责

`dataview-meta` 最终只负责：

- 维护语义 id -> `Label` 的映射
- 持有 dataview 自己的翻译 key 和 fallback 文案

`dataview-meta` 不再负责：

- 最终字符串渲染
- locale number/date/list 格式化
- 在 registry 内拼接子 label 的最终字符串
- `Label` 基础类型定义

因此：

- `renderMessage(...)` 退出主流程
- 如保留，也只保留为测试或无 i18n 宿主下的 fallback 工具

---

## 2. `ValueToken`

`ValueToken` 是本方案真正的共享展示中轴。

它的作用是：

- 让 engine/core 输出“结构化展示值”
- 而不是输出已经渲染好的字符串

它最终会同时服务：

- footer summary
- filter value preview
- section title
- group bucket label
- date/boolean/empty/system value

### 一个关键边界

`ValueToken` 这个概念应该复用 shared。

但 dataview 当前这版 token 不能原样上提，因为它已经掺入了 dataview 领域语义，例如：

- `option`
- `statusCategory`
- `dateBucket`

这些不是 shared 的基础概念，而是 dataview 自己的领域值。

所以长期最优不是把当前 dataview `ValueToken` 直接搬到 shared，而是把它去领域化，收敛成 shared 通用值 AST。

### 最终建议的 shared `ValueToken` 设计

```ts
export type ValueToken =
  | { kind: 'label'; value: Label }
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'date'; value: unknown }
  | { kind: 'list'; items: readonly ValueToken[] }
  | { kind: 'range'; min?: ValueToken; max?: ValueToken }
  | {
      kind: 'ref'
      ns: string
      id?: string
      payload?: unknown
    }
```

这里故意不做得太大。

长期原则是：

- 只有当某种展示语义会被多条路径复用时，才新增一种 token。
- 不允许各模块再各自发明 `displayText`、`labelText`、`xxxPreviewText`。

dataview 自己的特殊值最终都通过 `ref` 命名空间表达，例如：

- `{ kind: 'ref', ns: 'dataview.systemValue', id: 'value.empty' }`
- `{ kind: 'ref', ns: 'dataview.option', id: optionId }`
- `{ kind: 'ref', ns: 'dataview.statusCategory', id: category }`
- `{ kind: 'ref', ns: 'dataview.dateBucket', payload: { mode, start } }`

这样：

- shared 持有唯一通用 `ValueToken`
- shared 负责 token 渲染主流程
- dataview 只注册 `dataview.*` 的 resolver

### 为什么 `ValueToken` 比 `display: string` 更优

因为它同时解决了四件事：

1. i18n 不再被 engine 锁死。
2. React 可以按上下文决定展示形式。
3. 不同视图可以复用同一语义值。
4. 数字、日期、distribution、empty/system 值能走同一套渲染轴。
5. 各业务只保留自己的 resolver，而不是重新发明 token 体系。

---

## 3. 根级 `shared/i18n`

React 层需要一个统一语言环境入口，把：

- `Label`
- `ValueToken`
- 数字/百分比/日期/list formatter

统一收敛到宿主共享出口，而不是 dataview 私有出口。

最终建议在根级 `shared/i18n` 提供：

```tsx
<I18nProvider lang="zh">
  <Dataview />
  <Component1 />
</I18nProvider>
```

本文明确采用：

- `react-i18next`
- `i18next`

作为根级 shared React i18n 的正式技术栈。

也就是说，这里不再保留“React 层与 i18n 库完全无关”的抽象目标。

长期最优的分层不是让所有包都完全无感知，而是把感知严格限制在 `shared/i18n` 与最终 React 渲染层：

- `@dataview/core` 不依赖 `i18next`
- `@dataview/engine` 不依赖 `i18next`
- `@dataview/meta` 不依赖 `i18next`
- `shared/i18n` 直接依赖 `react-i18next` / `i18next`
- `@dataview/react` 只消费 shared i18n

原因：

1. 用户侧最终就是希望直接使用 `useTranslation()`
2. dataview 是内嵌组件，不应自带独立 provider 和独立语言切换入口
3. shared i18n 能同时服务 `<Dataview />` 和宿主其他组件
4. 如果再让 dataview 自己包一层 runtime，只会增加中间层
5. 因为 `engine` / `core` / `meta` 已经被约束为零文本，这个边界足够清晰

React 中统一通过 shared `useTranslation()` 包装：

```ts
const { t: rawT } = useTranslation()

const t = (label: Label) => rawT(label.key, {
  defaultValue: label.fallback,
  ...label.values
})
```

这样：

- `dataview-meta` 不绑定任何 i18n 库
- `dataview-engine` 不需要知道翻译实现
- `shared/i18n` 成为唯一正式语言环境入口
- `shared/i18n` 成为 `Label` / `ValueToken` 的唯一基础设施层
- `@dataview/react` 成为 shared i18n 的 dataview 消费层

### dataview 在 shared/i18n 之上的唯一扩展点

dataview 最终只保留三类东西：

1. 领域 id
2. `领域 id -> Label` 的 registry
3. dataview `ref` resolver

也就是说，dataview i18n 真正特殊的不是 Provider、hook、formatter、`Label`、`ValueToken`，而只是：

- 自己的 key
- 自己的字符串
- 自己的领域引用解析

---

## meta 的最终组织方式

当前 `meta.ui.*` 承担了过多领域职责。

长期最优应该按“领域语义”组织，而不是按“当前页面”组织。

建议最终至少拆成下面这些命名空间：

- `meta.calculation.metric`
- `meta.filter.preset`
- `meta.sort.direction`
- `meta.group.mode`
- `meta.group.bucketSort`
- `meta.field.kind`
- `meta.view.type`
- `meta.systemValue`
- `meta.ui`

### 各命名空间职责

`meta.ui`

- 只放页面 chrome 文案
- 例如按钮、popover title、placeholder、toolbar 文案

`meta.calculation.metric`

- 负责 `CalculationMetric -> Label`

`meta.filter.preset`

- 负责 `FilterPresetId -> Label`

`meta.systemValue`

- 负责 `SystemValueId -> Label`

`meta.field.kind`

- 负责 field kind label 和默认名称模板

`meta.group.mode`

- 负责分组模式 label

`meta.group.bucketSort`

- 负责 bucket sort label

### 一个重要约束

meta 内部不再用 `renderMessage(...)` 去提前把子 label 展开成最终字符串。

例如下面这种事不应该继续发生：

- `settings(viewType)` 内部先把 `viewType` 的 label render 出来，再塞回另一个 message 里

正确做法是：

1. meta 提供独立 label
2. React 在最终渲染点组合它们

例如：

```ts
t(meta.ui.toolbar.settings.currentView({
  view: t(meta.view.type.get(viewType).label)
}))
```

而不是 meta 自己 render。

---

## engine / core / meta / react 的最终职责

## 1. core

core 最终只保留：

- parse
- normalize
- compare
- group 归类
- search token
- 领域状态变换
- 领域 id 定义

core 最终删除：

- `display()` 风格 API
- relative date 文本
- bucket title 字符串生成
- boolean/empty/system value 文本

如果 core 仍需要表达“这个值是什么语义”，就输出：

- 领域 id
- 或 `ValueToken`

## 2. engine

engine 最终只保留：

- snapshot / projection
- 结构化结果汇总
- state reuse

engine 最终删除：

- `display`
- `fieldLabel`
- `valueText`
- `title: 'All'`
- 对 `@dataview/meta` 的依赖
- 所有 `Intl.*` 文本格式化

## 3. meta

meta 最终只保留：

- 语义 id 到 label 的映射

meta 最终删除主流程职责：

- 直接 render 字符串
- 在 registry 内做文案拼接

## 4. react

react 最终成为唯一展示层：

- `t(label)`
- `formatNumber`
- `formatPercent`
- `formatDate`
- `formatValueToken`
- presenter / renderer

所有用户可见文本最终都从这里发出。

并且这里的 `t(label)` 明确基于 `react-i18next` 的 `useTranslation()`。

---

## summary / footer 的最终 API 设计

`CalculationResult` 不应该继续带 `display`。

`CalculationDistributionItem` 不应该继续带 `label`。

最终建议改成：

```ts
export interface CalculationDistributionItem {
  value: ValueToken
  count: number
  percent: number
  color?: string
}

export type CalculationResult =
  | {
      kind: 'empty'
      metric: CalculationMetric
    }
  | {
      kind: 'scalar'
      metric: CalculationMetric
      value: number
    }
  | {
      kind: 'percent'
      metric: CalculationMetric
      numerator: number
      denominator: number
      value: number
    }
  | {
      kind: 'distribution'
      metric: CalculationMetric
      denominator: number
      items: readonly CalculationDistributionItem[]
    }
```

### 具体要求

1. engine summary 只负责计算，不负责显示。
2. option distribution item 用 `{ kind: 'ref', ns: 'dataview.option', id: optionId }` 表达。
3. option 已被删但历史数据仍存在时，用 `{ kind: 'text', text: optionId }` 兜底。
4. empty summary 只表达 empty，不返回 `'--'`。
5. React footer 通过 presenter 渲染，不消费 `display` 字符串。

### footer presenter 的最终职责

React 层新增统一 summary presenter：

- metric label 来自 `meta.calculation.metric`
- 数字/百分比通过 shared i18n formatter 格式化
- distribution 通过 shared `ValueToken` + dataview resolver 渲染 item label
- distribution 不再强制拼成单个字符串

长期最优下，distribution 型 footer 不应该假装自己和 scalar footer 是同一种 UI。

它应该以“分布摘要”身份被单独渲染，例如：

- 前若干项预览
- 剩余项折叠
- tooltip/popover 扩展

而不是继续用 `' · '` 拼接长字符串。

---

## filter projection 的最终 API 设计

当前 `FilterRuleProjection` 的两个问题字段是：

- `fieldLabel: string`
- `valueText: string`

这两个字段都应删除。

最终建议改成：

```ts
export interface FilterRuleProjection {
  rule: FilterRule
  field?: Field
  fieldMissing: boolean
  activePresetId: FilterPresetId
  effective: boolean
  editorKind: FilterEditorKind
  value: FilterValuePreview
  bodyLayout: 'none' | 'inset' | 'flush'
  conditions: readonly FilterConditionProjection[]
}

export type FilterValuePreview =
  | { kind: 'none' }
  | { kind: 'single'; value: ValueToken }
  | { kind: 'multi'; values: readonly ValueToken[] }
  | { kind: 'range'; min?: ValueToken; max?: ValueToken }
```

这样：

1. deleted field 文案由 React 通过 `fieldMissing` + `meta.systemValue` 决定。
2. filter value preview 复用 shared `ValueToken`。
3. filter preset label 直接用 `activePresetId -> meta.filter.preset`。

不再需要 engine 先把 filter value 转成英文字符串。

---

## section / group / bucket 的最终 API 设计

当前 section 和 group 的问题是：

- root section title 直接写死 `'All'`
- bucket title 已经被提前转成字符串

这条路径也必须结构化。

最终建议：

```ts
export interface SectionBucket {
  key: SectionKey
  label: ValueToken
  value?: unknown
  clearValue: boolean
  empty: boolean
  color?: string
}

export interface SectionNodeState {
  key: SectionKey
  label: ValueToken
  color?: string
  bucket?: SectionBucket
  recordIds: readonly RecordId[]
  visible: boolean
  collapsed: boolean
}
```

规则：

1. root section 用 `{ kind: 'system', id: 'section.all' }`
2. option/status bucket 用 dataview `ref`
3. date bucket 用 dataview `ref`
4. 纯文本 bucket 才使用 `{ kind: 'raw', text }`

这能保证：

- section title
- bucket title
- footer distribution label
- filter value label

最终都走同一套 `ValueToken` 渲染器。

---

## field kind 和 system value 的最终设计

`field/kind/*` 这条线需要一起收缩。

当前的长期问题不是某几个 helper，而是 core 在承担展示。

### 必须删除的职责

- `Kind.display`
- date relative 直接返回 `Today` / `Tomorrow` / `Yesterday`
- group bucket 直接生成 `title: string`
- boolean display 直接返回 `True` / `False`

### 最终正确职责

field kind 只负责：

- parse
- compare
- group entry 归类
- search token
- 必要的语义投影

system value 统一改为输出语义：

- `ValueToken`
- 或领域 id

然后交给 React render。

---

## 默认 field 名称的最终方案

这是本次设计里一个必须单独说清的点。

当前 engine command 里直接：

1. 从 meta 读默认 field 名
2. `renderMessage(...)`
3. 调 `createUniqueFieldName(...)`

这是错误分层。

原因很简单：

- 默认 field 名最终会落盘，属于用户数据
- 但它的候选文本来源是系统 i18n 文案

长期最优下，这件事不能在 engine 做。

### 最终方案

1. engine 不再 import meta。
2. engine 不再在内部生成默认 field name。
3. 需要默认 field name 的地方，由 UI 或宿主先生成本地化基名。
4. 然后 UI 再把最终 name 显式传给 engine。

例如：

1. React 用 `t(meta.field.kind.get(kind).defaultName)` 得到本地化基名。
2. React 调 `createUniqueFieldName(baseName, fields)` 得到最终 name。
3. React 把 `name` 传给 `field.create`。

这样 engine 写入线保持零文本。

### 一个重要结论

如果一步到位不考虑兼容，建议直接把“无 name 的 field.create 默认补名”从 engine 删掉。

也就是说：

- 没有显式 `name` 的 create，不再由 engine 做文案兜底。

---

## React 侧最终基础设施

为了避免 React 又到处手写 `t(meta.xxx)`、`formatNumber(...)`、`switch(token.kind)`，需要提供共享基础设施。

长期最优下，这套基础设施不应放在 `dataview/packages/dataview-react/src/i18n`，而应上提到根级共享层，例如：

- `shared/i18n`

宿主统一使用：

```tsx
<I18nProvider lang="zh">
  <Dataview />
  <Component1 />
</I18nProvider>
```

内部至少包含：

1. 宿主统一 `I18nProvider`
2. shared `useTranslation()`
3. shared locale / number / date / percent formatter
4. dataview `ref` resolver
5. 领域级轻 presenter

例如：

- footer summary presenter
- filter value presenter
- section label presenter

### 原则

这些 presenter 不是新的业务中间层。

它们只是：

- `Label`
- `ValueToken`
- `shared/i18n`

在 React 的薄包装。

也就是说：

- 中轴只有一个
- React 只是消费中轴，不再自己发明新的 `display helper`

---

## 必须删除的旧实现

如果目标是一步到位完成，下面这些旧实现都必须删除，不应保留兼容：

### 1. calculation 旧文本字段

- `CalculationResult.display`
- `CalculationDistributionItem.label`

### 2. engine projection 旧文本字段

- `FilterRuleProjection.fieldLabel`
- `FilterRuleProjection.valueText`
- section/root/bucket 上的系统 `title: string`

### 3. engine 中的 UI 依赖

- `@dataview/meta` import
- `renderMessage(...)`
- `Intl.NumberFormat(...)`

### 4. core 中的显示职责

- `Kind.display`
- date relative text 返回
- boolean/empty/system value display text
- group bucket title string 生成

### 5. React 内局部硬编码文案

- calculation metric 中文硬编码
- filter preset 英文硬编码
- date picker 及其他局部硬编码

### 6. meta 中的提前渲染路径

- 主流程里对 `renderMessage(...)` 的依赖
- registry 内部提前 render 子 label 的写法

### 7. 领域 id 的错误归属

- 在 `meta` 定义领域 id
- 在 `react` 定义领域 id
- 在 engine 本地发明仅 UI 可见的伪领域 id
- 用单个总表文件集中定义所有领域 id

---

## 推荐落地顺序

## P0. 建立中轴

先完成：

1. `MessageSpec -> Label`
2. `message() -> label()`
3. `meta.systemValue`
4. shared `ValueToken`
5. 在 `core` 明确领域 id 的最终归属并补齐必要导出
6. 在根级 `shared/i18n` 接入 `react-i18next` / `i18next`
7. `@dataview/react` 改为消费 shared i18n，而不是自带 provider / runtime
8. dataview 特殊值统一改为 `ref` + resolver

没有这一步，后续路径只能局部改，不能真正收口。

## P1. 先重做 summary/footer

原因：

- 问题最明显
- contract 简单
- 最能验证整套设计是否成立

这一阶段应完成：

1. 删除 `CalculationResult.display`
2. 删除 `CalculationDistributionItem.label`
3. footer 改为 presenter 渲染
4. `ColumnHeader` calculation menu 切到 meta registry

## P2. 重做 filter/query projection

这一阶段应完成：

1. 删除 `fieldLabel`
2. 删除 `valueText`
3. 引入 `FilterValuePreview`
4. filter preset 全量切到 meta registry

## P3. 重做 section/group/bucket

这一阶段应完成：

1. root section `'All'` 删除
2. bucket title 改成 `ValueToken`
3. date/group bucket label 统一走 render 轴

## P4. 清理 core 显示职责

这一阶段应完成：

1. 删除 `Kind.display`
2. date relative 改为语义 token
3. boolean/empty/system value 改为 token/id
4. field create 默认名从 engine 移到 React/host

## P5. React 全量收口

这一阶段应完成：

1. 清理所有硬编码文本
2. 清理 `renderMessage(...)` 主流程调用
3. 所有视图 presenter 全量改走统一 i18n adapter

---

## 代表性修改点

以下文件属于本次重构的代表路径：

- `dataview/packages/dataview-react/src/views/table/components/body/ColumnFooterBlock.tsx`
- `dataview/packages/dataview-engine/src/active/snapshot/summary/compute.ts`
- `dataview/packages/dataview-core/src/calculation/contracts.ts`
- `dataview/packages/dataview-engine/src/contracts/public.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/base.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/sections/derive.ts`
- `dataview/packages/dataview-engine/src/active/commands/table.ts`
- `dataview/packages/dataview-core/src/field/kind/index.ts`
- `dataview/packages/dataview-core/src/field/kind/date.ts`
- `dataview/packages/dataview-react/src/views/table/components/column/ColumnHeader.tsx`
- `dataview/packages/dataview-react/src/page/features/filter/filterText.ts`
- `dataview/packages/dataview-meta/src/message.ts`
- `dataview/packages/dataview-meta/src/ui.ts`

---

## 最终状态清单

当这份方案全部完成后，dataview 应满足下面这些状态：

1. engine 不再包含任何系统用户可见文本。
2. engine 不再直接依赖 `dataview-meta`。
3. core 不再承担系统展示文本职责。
4. 所有系统文案都能在 `dataview-meta` 找到唯一映射。
5. 所有领域 id 都明确归属于 `core` 体系。
6. `@dataview/react` 成为唯一正式 `react-i18next` 渲染层。
7. footer / filter / section / group / system value 共用同一套 `ValueToken` 轴。
8. contract 中不再出现 `display` / `valueText` / `fieldLabel` 这类旧时代字段。
9. 默认 field name 的生成移动到 UI/host。
10. `renderMessage(...)` 退出主流程。

---

## 最终判断

这条线的长期最优解，不是把 engine 里每个字符串都替换成 `labelKey`。

真正更优的方案是：

1. 语义 id 直接复用已有领域 id。
2. 需要额外系统值时，只补极少量 `SystemValueId`。
3. 所有结构化展示值统一收敛到 `ValueToken`。
4. 所有系统文案统一收敛到 `dataview-meta`。
5. 所有最终渲染统一收敛到 `@dataview/react` 的 `react-i18next useTranslation()` 和 formatter。

这样可以同时做到：

- 中轴唯一
- 分层清晰
- API 简单
- 复用度高
- 不再到处出现“先拼一段 display 文本再想办法翻译”的反模式

这才是 dataview 在 i18n 和展示语义上的长期最优架构。
