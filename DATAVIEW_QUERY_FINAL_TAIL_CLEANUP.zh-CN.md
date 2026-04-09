# Dataview Query 最后一轮收尾清单

## 1. 当前状态

本轮重构完成后，query 架构已经基本达到长期最优目标。

当前边界如下：

- `field`
  - 只负责字段 schema、value semantics、display、compare、search token、group capability
- `filter`
  - 负责 filter rule / preset / projection / matching / state mutate
- `sort`
  - 负责 sorter state / compare / projection
- `group`
  - 负责 group state / bucket state / grouping projection / grouped records
- `search`
  - 负责 search state / execute / projection
- `query`
  - 只剩 whole-query 的 normalize / equality

当前 `core/query` 已经只剩：

- `dataview/src/core/query/index.ts`
- `dataview/src/core/query/normalize.ts`
- `dataview/src/core/query/equality.ts`

已经删除的旧层包括：

- `core/query/filter.ts`
- `core/query/group.ts`
- `core/query/grouping.ts`
- `core/query/search.ts`
- `core/query/sort.ts`
- `core/query/semantics.ts`
- `core/query/shared.ts`
- `core/query/contracts.ts`

并且：

- `engine.read.filter`
- `engine.read.sort`
- `engine.read.group`
- `engine.read.search`

都已经存在，UI 主要 query 入口也已改成直接消费 projection。


## 2. 已经完成的统一

### 2.1 模块职责统一

- `filter / sort / group / search` 不再挂在 `query` 下面做语义实现
- `query` 不再充当规则中心
- `engine command` 不再依赖 `core/query` 去改 filter/sort/group/search 子状态

### 2.2 读模型统一

- query UI 不再拿 raw state 自己二次推导主要 query 语义
- query 相关 projection 已经集中在各自子模块中

### 2.3 命名统一

`ViewQuery` 已统一为：

```ts
type ViewQuery = {
  filter: Filter
  search: Search
  sort: Sorter[]
  group?: ViewGroup
}
```

不再保留旧的 `sorters` 命名。


## 3. 最后一轮还可以收的点

现在剩下的已经不是 query 模型层问题，而是使用侧的“尾巴”。

这些尾巴可以继续清，但优先级明显低于已经完成的架构拆分。

### 3.1 View / Controller 使用侧仍直接读 raw `view.sort` / `view.group` / `view.search`

这类代码主要还存在于：

- table / gallery / kanban controller
- table column header
- page resolved state
- engine projection/view/grouping
- engine services/view

这些地方目前直接读 raw state，本身不一定是错的，因为它们很多不是“渲染 query UI”，而是在做：

- 能力判断
- reorder 可用性判断
- column UI 状态判断
- section 写回逻辑

这里最关键的判断是：

- 如果代码只是做“是否存在 group / sort”的行为判断，直接读 raw state 可以接受
- 如果代码开始自己推导 label、effective、capability、summary，那就应该改成消费 projection

也就是说，最后一轮不应该机械地把所有 raw state 读取都改掉，而应该只清理那些已经开始做派生语义的读取点


### 3.2 `engine/projection/view/grouping.ts` 仍然偏像“使用层工具”

当前它承担的是：

- 把 section key 写回 record value
- 根据字段 kind 反推拖拽/建卡后的 next value

这个文件现在不属于旧 query 架构问题，但从长期可读性看，它仍然有一点“engine 自己在理解字段分组写回语义”的味道。

长期更优的方向是把它继续收成更明确的 `group.write` 能力，例如：

```ts
group.write.create(...)
group.write.move(...)
group.write.nextValue(...)
```

但这已经是下一层优化，不是本轮必须项。


### 3.3 `page/state/resolved.ts` 仍然直接看 `view.filter.rules.length` / `view.sort.length`

这一层现在只是做：

- query bar 是否可见
- route 是否仍有效

严格来说它也可以直接吃：

- `engine.read.filter`
- `engine.read.sort`

但收益不大，因为这里做的是非常轻的存在性判断，不涉及复杂派生。

所以这一项属于：

- 可以收
- 但不是必要


## 4. 推荐的最终收口原则

最后一轮不要再追求“彻底消灭 raw state 读取次数”，而应该遵循下面的简单标准：

### 4.1 允许直接读 raw state 的场景

- 只判断有没有 group
- 只判断有没有 sort
- 只判断 search query 是否为空
- 只基于 persisted state 做 command / projection / writeback

### 4.2 必须改成 projection 的场景

- 要显示 query label
- 要判断 rule effective
- 要决定 editor kind
- 要决定 condition list
- 要推导 group summary
- 要推导 sort summary
- 要做“这个 query 在 UI 上怎么展示”的逻辑

### 4.3 不再继续抽象的场景

如果某段逻辑只是：

- `Boolean(view.group)`
- `view.sort.length === 0`
- `view.search.query.trim()`

那不要为了“架构洁癖”再包一层 projection。

长期最优不是 projection 越多越好，而是：

- 派生语义统一进 projection
- 原始状态判断保持直接


## 5. 如果要继续做，建议的顺序

如果要把最后一轮也做完，建议顺序如下：

1. 清理使用侧“错误地自己派生 query 语义”的点
2. 保留纯 raw state existence check，不要过度封装
3. 视情况把 `engine/projection/view/grouping.ts` 收成更明确的 `group.write`
4. 最后再决定要不要保留 `core/query` 这个 3 文件目录


## 6. 关于 `core/query` 是否继续保留

当前 `core/query` 只剩：

- `normalize`
- `equality`

这已经非常薄了。

长期上有两个都合理的选择：

### 方案 A：保留 `core/query`

优点：

- whole-query 入口明确
- `normalizeViewQuery` / `isSameViewQuery` 有稳定归属

缺点：

- 目录看起来很薄

### 方案 B：完全删除 `core/query`

做法：

- `normalizeViewQuery` 挪到 `core/view` 或 `core/contracts`
- `isSameViewQuery` 挪到相邻位置

优点：

- 目录更少

缺点：

- whole-query 这个概念失去独立归属

当前更推荐保留 `core/query`。

原因很简单：

- 它现在已经不厚
- 但 whole-query 仍然是一个稳定概念
- 留下这 3 个文件，比把它们塞回别的目录更清楚


## 7. 结论

从“长期最优、复杂度低、可读性强”的标准看，query 架构主线已经完成。

最后一轮真正值得做的，不是继续大拆，而是：

- 识别使用侧哪些地方还在错误地自己派生 query 语义
- 把这些点改成直接吃 projection
- 同时明确允许简单 raw state 判断继续存在

也就是说，最后的收尾目标应该是：

- 消灭错误的二次派生
- 不制造新的抽象层
- 不为了统一而统一

这才是这轮重构之后最稳的收口方式。
