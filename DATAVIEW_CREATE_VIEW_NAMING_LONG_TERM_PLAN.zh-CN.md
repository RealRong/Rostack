# Dataview Create View 命名长期方案

## 问题定义

当前 [`useCreateView.ts`](/Users/realrong/Rostack/dataview/src/react/page/features/createView/useCreateView.ts) 同时承担了两类职责：

- UI 入口语义：
  - 不同创建入口想创建什么类型的 view
  - 默认文案来自哪里
  - 文案是否本地化
- 领域命名规则：
  - 如果目标名字已存在，如何生成唯一名字
  - `Table`、`Table 2`、`Table 3` 这种序列规则怎么定

这两类职责不应该放在同一层。

如果继续把它们都留在 React hook 内部，会带来几个长期问题：

- 任何新创建入口都可能复制一份命名逻辑
- 不同入口可能出现不一致的重名处理行为
- engine 无法保证 “view 创建” 的行为一致性
- UI 文案和领域规则被绑死，后续难以扩展

## 核心判断

长期最优方案不是把整个 `useCreateView.ts` 下沉到 engine，而是把其中的“命名冲突解决规则”下沉，把“UI 默认名称来源”留在上层。

换句话说：

- `renderMessage(item.label)` 不该下沉
- `createViewName()` 这种唯一命名规则应该下沉

## 为什么不能整段下沉到 engine

### 1. 默认名称来源是 UI 语义，不是领域语义

当前创建视图时，基础名称来自 UI catalog 和本地化文案。

这部分包含：

- 不同按钮或卡片显示什么 label
- 语言环境如何影响名称
- 产品层是否希望某个入口默认叫 “Tasks” 而不是 “Table”

这些都是上层产品语义，不属于 engine 的职责。

如果把这部分下沉到 engine，会出现以下问题：

- engine 需要知道 meta/message/catalog
- engine 被迫依赖本地化层
- 同一个 view type 在不同产品入口下无法表达不同默认名称

所以 engine 不应该拥有 “默认名字是什么” 这个决策权。

### 2. 重名处理是领域规则，应该被统一保证

一旦用户输入或 UI 提供了一个候选名称，接下来遇到的问题就不是 UI 了，而是领域一致性：

- 名称冲突如何处理
- 后缀编号规则如何处理
- 重复创建时是否应稳定地得到相同模式的名称

这类规则不应该散落在各个 UI hook 中。

因为从系统角度看，未来都可能创建 view：

- create view popover
- duplicate view
- command palette
- import / restore
- 自动迁移脚本
- 外部 API

如果 engine 不统一处理，结果一定会分叉。

## 最优边界

长期最简边界应该是：

### UI 层负责

- 选择要创建的 `type`
- 决定传给 engine 的 `baseName` 或 `preferredName`
- 本地化文案
- 入口层交互

### core 层负责

- 纯命名算法
- 唯一名称解析
- 后缀递增规则
- 命名规范的纯函数化表达

### engine 层负责

- 在创建 view 时统一调用命名算法
- 保证所有创建入口行为一致
- 最终提交 document mutation

## 推荐结构

推荐拆成两层：

1. `core` 提供纯函数
2. `engine.views.create()` 统一使用这个纯函数

示意如下：

```ts
// core
resolveUniqueViewName(existingViews, preferredName): string

// engine
engine.views.create({
  type,
  name: preferredName
})
```

其中：

- UI 提供 `preferredName`
- engine 在真正创建前调用 `resolveUniqueViewName`
- 返回的 `viewId` 对应的 view 名称由 engine 保证唯一

## 为什么算法应该先放 core

把命名算法单独放在 `core` 而不是直接埋进 `engine.views.create()`，有几个长期收益：

### 1. 保持 engine service 轻薄

engine 负责 orchestration，core 负责纯规则。

这样 engine 不需要承载过多细节逻辑，依旧保持：

- 读取现有 views
- 调用纯函数
- 生成 command

### 2. 规则更容易测试

纯函数比 engine API 更容易覆盖边界场景：

- 已有 `Table`
- 已有 `Table 2`
- 有空格变体
- 有跨语言字符
- 用户手输带编号名称

如果算法是纯函数，测试成本最低。

### 3. 后续别的命名对象也能复用

今天讨论的是 view name，未来可能还有：

- field name
- section name
- option name

一旦唯一命名规则被抽成 `core` 模块，后面可以形成统一的 naming toolkit，而不是每个领域对象都在 engine service 里手搓一遍。

## engine API 的长期最优形式

长期最优我建议是：`engine.views.create()` 只暴露一个创建入口，但内部默认做名称唯一化。

也就是：

```ts
engine.views.create({
  type,
  name
})
```

其语义不是：

- “按这个名字原样创建”

而是：

- “这是调用方的期望名称，engine 会保证最终落下的是合法且唯一的名称”

这样 API 最简。

调用方不需要知道是否发生过重名修正，只需要拿 `viewId`。

## 不推荐的几种方案

### 方案一：继续留在 React hook

不推荐原因：

- 规则分散
- 多入口不一致
- engine 无法统一保证
- UI 组件变成领域规则承载点

这是当前方案的主要问题。

### 方案二：整个默认命名都放进 engine

例如：

```ts
engine.views.create({
  type: 'table'
})
```

然后 engine 自己决定默认叫 `Table`。

这不够好，因为：

- engine 会被迫知道 view type 对应的默认文案
- UI 无法按产品上下文覆写默认名称
- 本地化和产品表达侵入 engine

除非你明确希望 engine 成为“产品级默认命名中心”，否则不推荐。

### 方案三：额外暴露 `engine.views.suggestName()`

例如：

```ts
const name = engine.views.suggestName('Table')
const id = engine.views.create({ type: 'table', name })
```

这个方案有一个明显问题：

- `suggestName()` 和 `create()` 分离后，中间可能发生并发变化
- create 时仍然需要再做一次唯一化

结果就是：

- 要么 `suggestName()` 只是 UI 预览用途
- 要么 `create()` 仍然必须重复做一次

所以它不能替代 engine 内部的最终保证。

如果真的要有 `suggestName()`，它只能是可选的 UI 辅助接口，而不能成为主流程依赖。

## 长期最优最简方案

最终推荐方案如下：

### 一. UI 提供 `preferredName`

UI 入口基于产品语义和文案，决定基础名称：

```ts
const preferredName = renderMessage(item.label)
```

这里保留在 React / 产品层。

### 二. core 提供唯一命名纯函数

例如：

```ts
resolveUniqueViewName({
  existingNames,
  preferredName
})
```

职责仅限于：

- trim / normalize
- 判断冲突
- 生成递增后缀

不依赖 engine，不依赖 UI。

### 三. engine 在 create 时统一调用

例如：

```ts
engine.views.create({
  type: item.type,
  name: preferredName
})
```

内部逻辑为：

1. 读取现有 view 名称
2. 调用 `resolveUniqueViewName`
3. 生成最终 command
4. 创建 view

### 四. UI 不再自行处理重名

这意味着 `useCreateView.ts` 未来应该只保留：

- 构造 `preferredName`
- 调用 `engine.views.create`
- 创建后切换到新 view

而不再包含任何“名字加 2/3/4”的算法。

## 命名策略建议

为了保持长期一致性，命名规则最好统一成下面这套：

- 保留调用方传入的 `preferredName` 作为首选
- 若未冲突，原样使用
- 若冲突，生成 `preferredName 2`
- 若继续冲突，依次递增
- 不尝试做“智能跳号回填”
- 不在 UI 层手动拼接后缀

这样足够简单、稳定、可预测。

“最简”比“聪明”更重要。

## 关于 duplicate 的处理

长期看，duplicate view 也应该复用同一套命名规则。

也就是说：

- duplicate 的基础名称仍由上层或 engine 决定，例如 `原名称副本` 或 `Copy of X`
- 但一旦得到候选名称，最终唯一化规则仍走同一个 core 函数

这样可以避免：

- create 一套规则
- duplicate 另一套规则

## 最终结论

长期最优最简设计是：

- UI 决定基础名称
- core 提供唯一命名纯函数
- engine 在 `views.create()` 内统一做最终唯一化保证

用一句话概括就是：

**“名字从 UI 来，唯一性由 engine 保证，算法沉到 core。”**

这条边界最稳定，也最不容易在未来继续长歪。

## 后续实施建议

如果后面要真正改代码，建议顺序是：

1. 先把 `createViewName()` 提炼成 `core` 纯函数
2. 让 `engine.views.create()` 内部统一调用
3. 再把 `useCreateView.ts` 里的本地重名逻辑删除
4. 最后视需要决定是否补一个只用于 UI 预览的 `suggestName()`

其中第 4 步不是必须项。

长期方案的主路径不应该依赖 `suggestName()`。
