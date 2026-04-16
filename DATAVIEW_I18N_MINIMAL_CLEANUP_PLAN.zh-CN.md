# Dataview i18n 最终最小化设计

## 文档目标

这份文档只回答一个问题：

dataview 的 i18n 体系如果继续收缩，长期最优、概念最少、复用最高的最终形态应该是什么。

最终结论很明确：

- 不再保留 `Label` 和 `ValueToken` 两个并列概念
- 不再保留 `renderMessage`、`renderLabel`、`formatValueToken`、`ValueTokenText`、`useDataViewI18n`
- 不再让 dataview 持有自己的 i18n provider、自己的 i18n runtime、自己的基础 token 类型
- 最终只保留：
  - 一个数据概念：`Token`
  - 一个执行入口：`t(token)`

本文默认：

- 不保留兼容
- 不在乎重构成本
- 目标是长期最优
- engine 不产文本
- dataview 是内嵌组件
- 宿主统一提供 i18n 环境
- 领域 id 统一归 `@dataview/core`

---

## 一句话结论

最终应收敛成：

`领域 id / 结构化值 -> Token -> shared/i18n.useTranslation().t(token) -> string`

也就是说：

1. `Token` 是唯一共享展示数据结构
2. `t` 是唯一共享渲染函数
3. dataview 只保留：
   - 领域 id
   - dataview 自己的翻译 key / fallback 文案
   - dataview 自己的 resolver

其他都应该上提到根级 `shared/i18n`。

---

## 为什么还要继续收

当前体系即使已经比以前干净，仍然有三个多余点。

### 1. `Label` 和 `ValueToken` 仍然是两套概念

如果最终对外消费入口都是：

- `t(label)`
- `formatValueToken(token)`

那说明体系还没收完。

长期最优下，不应该让用户再记两套数据概念。

### 2. dataview 仍然残留自己的 i18n 世界观

例如：

- `useDataViewI18n`
- `ensureDataViewI18n`
- dataview 私有 formatter
- dataview 私有 provider / runtime

这和“dataview 是内嵌组件”目标相冲突。

### 3. `ValueToken` 里仍然容易继续长出无意义 kind

像：

- `text`
- `number`
- `boolean`

这类 primitive 值，很多根本不需要显式 `kind`，完全可以通过 JS 类型或结构直接判断。

如果连这些都继续包成：

```ts
{ kind: 'text', text: 'foo' }
{ kind: 'number', value: 1 }
```

那只是机械加壳，不是在简化体系。

---

## 最终最小模型

### 1. 只保留一个数据概念：`Token`

`Token` 是唯一共享的 i18n / value 展示数据结构。

它既覆盖原来的：

- `Label`
- `ValueToken`

也覆盖原来的：

- raw text
- number
- boolean
- list
- range
- system value
- dataview option/status/date bucket 等领域引用

### 2. 只保留一个函数概念：`t`

最终共享 API 只保留：

```ts
const { t } = useTranslation()

t(token)
```

其中：

- `t(token)` 默认返回 `string`
- `t` 在公开 API 上应尽量保持一元函数

这条规则很重要：

- `field`
- `document`
- `view`
- `optionMap`

这类 dataview 领域对象，不应作为 `t` 的第二参数出现在调用点。

但这里有一个重要约束：

- `t` 是公开入口
- token transport shape 不应该成为主要的人写代码接口

也就是说，最终公开规则应写死为：

- render 层尽量只写 `t(token)`
- 不允许把领域上下文对象作为 `t` 的公开调用参数暴露出去

### 3. `Token` 不是函数，不是组件

`Token` 必须保持为纯数据。

原因：

- 可序列化
- 可缓存
- 可比较
- 可跨 engine / core / meta / react 传递
- 不绑定 React
- 不绑定 UI 布局

这条边界必须卡死。

---

## 最终 `Token` 设计

长期最优下，`Token` 应尽量依赖：

- `typeof`
- `Array.isArray`
- 结构判别

而不是给所有 primitive 都强行加 `kind`。

建议最终收敛为：

```ts
export type Token =
  | string
  | number
  | boolean
  | readonly Token[]
  | {
      key: string
      fallback: string
      values?: Record<string, unknown>
    }
  | {
      ref: string
      id?: string
      payload?: unknown
    }
  | {
      min?: Token
      max?: Token
    }
```

### 判别规则

- `string`：原始文本
- `number`：本地化数字
- `boolean`：本地化布尔值
- `Token[]`：本地化列表
- `{ key, fallback, values? }`：翻译 token
- `{ ref, id?, payload? }`：引用 token
- `{ min?, max? }`：range token

### 为什么这是最小形态

因为它只保留真正不可由类型推断的结构：

- translation object
- ref object
- range object

而：

- string
- number
- boolean
- array

都不再额外包壳。

### `ref` 的边界

`{ ref, id?, payload? }` 只是 shared 留给各业务的内部扩展插槽。

它适合：

- engine/core 输出纯数据
- shared resolver registry 做统一调度
- meta 或 constructor 在内部产出 token

它不适合：

- 成为主要的业务 authoring 形态

也就是说：

- transport shape 可以抽象
- 公开调用形态不能抽象到看不懂

### 现场构造 token 的最终规则

最终最优顺序应是：

1. 上游直接产好 token，render 层只写 `t(token)`
2. 如果必须现场构造，使用非常薄、非常具体的 constructor
3. 不允许把领域对象作为 `t` 的第二参数补进去

也就是说，可以接受：

```ts
t(row.optionLabel)
t(optionLabelToken(field, optionId))
t(dateBucketToken(mode, start))
```

但不应鼓励：

```ts
t(row.optionLabel, { field })
t({ ref: 'dataview.option', id: optionId }, { field })
t(token(field))
```

原因：

- `t` 应保持一元
- constructor 可以具体表达领域语义
- 第二参数会让 `t` 泄漏 dataview 领域上下文
- 泛泛的 `token(field)` 命名可读性太差

---

## `Token` 的职责边界

`Token` 只表达“可被本地化为内联文本的语义值”。

它不负责：

- 布局
- 组件形态
- 图标
- badge
- tooltip
- popover
- 截断
- 样式
- 多行排版

所以 `t(token)` 的默认结果必须是：

- `string`

而不是：

- `ReactNode`
- 组件
- 富布局对象

如果以后真的需要富 UI，那是 presenter / view 层的职责，不是 `Token` 的职责。

---

## shared/i18n 的最终职责

根级 `shared/i18n` 才是唯一正式 i18n 中轴。

它最终负责：

- `Token` 基础类型
- `useTranslation()`
- `t(token)`
- 宿主统一 `I18nProvider`
- `react-i18next` / `i18next` 接入
- number / percent / date / list formatter
- resolver registry
- resolver dispatch

它不负责：

- dataview 领域模型
- dataview engine/runtime
- dataview registry 内容

### 最终宿主形态

```tsx
<I18nProvider lang="zh">
  <Dataview />
  <Component1 />
</I18nProvider>
```

`Dataview` 不再有自己的 i18n provider。

---

## `useTranslation()` 的最终 API

最终不应该暴露：

- `renderLabel`
- `formatValueToken`
- `ValueTokenText`
- `useDataViewI18n`

而应该只暴露：

```ts
const { t } = useTranslation()
```

使用方式统一为：

```ts
t(meta.ui.toolbar.search)
t(12345)
t(['A', 'B', 'C'])
t(section.label)
t(row.optionLabel)
t(optionLabelToken(field, optionId))
```

换句话说：

- 所有可翻译、可格式化、可解析的展示值
- 最终都走 `t`

这比：

- `t(label)`
- `formatValueToken(token)`
- `<ValueTokenText />`

更简单，也更稳。

---

## dataview 最终只剩什么

如果走这条路线，dataview 真正特殊的东西只剩三类。

### 1. 领域 id

例如：

- `CalculationMetric`
- `FilterPresetId`
- `SortDirection`
- `StatusCategory`

这些仍然归 `@dataview/core`。

### 2. dataview 自己的 registry

`@dataview/meta` 最终只做：

- `领域 id -> Token`

例如：

```ts
meta.systemValue.get(id)
meta.field.kind.get(id)
meta.sort.direction.get(id)
```

这里返回的已经不再是私有 `Label`，而是 shared `Token`。

### 3. dataview 自己的 resolver

shared `Token` 里唯一保留的开放扩展点是：

```ts
{ ref, id?, payload? }
```

dataview 自己只需要注册这些 resolver：

- `dataview.systemValue`
- `dataview.option`
- `dataview.statusCategory`
- `dataview.dateBucket`

例如内部 transport shape 可以是：

```ts
{ ref: 'dataview.systemValue', id: 'value.empty' }
{ ref: 'dataview.option', id: optionId }
{ ref: 'dataview.statusCategory', id: category }
{ ref: 'dataview.dateBucket', payload: { mode, start } }
```

但业务代码不应该到处直接手写这些对象。

更合理的方式只有两种：

1. 直接消费 engine/meta 已经产出的 token
2. 在极少数需要手动构造时，使用极薄 constructor

例如：

```ts
t(row.optionLabel, { field })
t(tokens.option(optionId), { field })
```

其中 `optionLabelToken(...)` 只是非常薄的 authoring helper，不是新的架构概念。

shared 负责调度 resolver，dataview 只负责实现 resolver 和少量 constructor。

---

## 各层职责最终划分

### `shared/i18n`

只负责：

- `Token`
- `t(token)`
- Provider
- locale / formatter
- resolver registry

### `@dataview/core`

只负责：

- 领域 id
- 领域模型
- dataview 自己的结构化 projection
- dataview resolver 所需的领域载荷

### `@dataview/meta`

只负责：

- dataview 自己的翻译 key / fallback 文案
- `领域 id -> Token`

### `@dataview/react`

只负责：

- 消费 shared `useTranslation()`
- 注册 dataview resolver
- 在 UI 组件里调用 `t(token)`
- 极薄 presenter
- 极薄 token constructor

### `@dataview/engine`

只负责：

- 输出结构化语义结果
- 输出 `Token`
- 输出领域 id

不负责：

- 文本
- locale 格式化
- i18n runtime

---

## 必须删除的旧东西

这次如果一步到位，不应保留下面这些东西。

### 概念

- `Label`
- `ValueToken`
- `LabelSpec`
- `MessageSpec`
- `DataViewI18n`

这里的意思不是删除“翻译对象能力”和“值 token 能力”，而是删除它们作为独立一级架构概念。

最终统一收编进：

- `Token`

### API

- `message`
- `label`
- `renderMessage`
- `renderLabel`
- `setLabelRenderer`
- `formatValueToken`
- `ValueTokenText`
- `useDataViewI18n`
- `ensureDataViewI18n`

### 运行时

- dataview 私有 i18n runtime
- dataview 私有 i18n provider
- dataview 私有 i18n 初始化逻辑

### 类型归属

- dataview 私有 `Label` 定义
- dataview 私有 `ValueToken` 定义

---

## 迁移顺序

### 阶段 1：先统一成 `Token`

先把：

- `Label`
- `ValueToken`

统一折叠为：

- `Token`

并明确 primitive 不再显式包 `kind`。

### 阶段 2：shared 提供唯一 `t`

根级 `shared/i18n` 提供：

- `useTranslation()`
- `t(token)`
- resolver registry

### 阶段 3：dataview 改成只产 `Token`

把所有：

- section label
- filter preview
- summary item
- system value
- option/status/date bucket

统一改成 shared `Token`。

### 阶段 4：dataview 特殊值全部收口到 `ref`

例如：

- `option`
- `statusCategory`
- `dateBucket`

统一改成：

- `{ ref, id?, payload? }`

但这只是内部 token transport shape，不是推荐的主要 authoring 形态。

优先顺序应是：

1. 直接传 engine/meta 已产出的 token
2. 必要时调用薄 constructor
3. 最后才是内部直接写 transport shape

同时明确：

- 不允许把 `field/document/view` 这类领域对象作为 `t` 的第二参数暴露出去
- 若必须依赖这些信息，应在 constructor 阶段消化，而不是在 `t` 阶段补上下文

### 阶段 5：删干净旧入口

删除：

- `renderMessage`
- `renderLabel`
- `formatValueToken`
- `ValueTokenText`
- `useDataViewI18n`
- `ensureDataViewI18n`
- dataview 私有 i18n provider/runtime

---

## 最终判断标准

当下面这些条件全部满足时，才算真正收完。

### 架构层面

- 只有一个数据概念：`Token`
- 只有一个执行入口：`t(token)`
- `shared/i18n` 是唯一 i18n 中轴
- dataview 不再拥有自己的 i18n 世界观

### 类型层面

- primitive token 不再显式包 `kind`
- dataview 不再定义私有 `Label` / `ValueToken`
- dataview 特殊值统一通过 `ref` 扩展
- 裸 `{ ref }` 对象不是主要业务 authoring 形态

### 使用层面

- React 统一写成 `const { t } = useTranslation()`
- 所有展示值统一走 `t(...)`
- `t` 在公开 API 上保持一元
- 不再出现 `renderMessage(...)`
- 不再出现 `formatValueToken(...)`
- 不再出现 `<ValueTokenText />`
- 业务代码极少直接手写 `{ ref }` 对象
- 业务代码不把 `field/document/view` 作为 `t` 的第二参数传入

---

## 最终结论

长期最优下，dataview i18n 不应该停在：

- `Label`
- `ValueToken`
- `formatValueToken`

这类“已经比以前干净，但仍然不够收”的阶段。

它应该继续收敛成最小终态：

1. 一个共享数据概念：`Token`
2. 一个共享执行入口：`t(token)`

而且：

- primitive 尽量靠 `typeof` / 结构判别
- 非 primitive 才使用最少量对象结构
- render 层尽量只写 `t(token)`，不暴露领域上下文参数
- dataview 真正特殊的只剩领域 id、翻译 key / 文案、以及 dataview resolver

这才是概念最少、复用最高、长期最稳的形态。
