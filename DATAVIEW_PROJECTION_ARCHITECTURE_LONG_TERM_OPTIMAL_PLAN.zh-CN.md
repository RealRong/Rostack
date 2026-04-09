# Dataview Projection 长期最优方案迁移清单

## 1. 文档目的

本文不是终态介绍稿，而是直接执行的迁移清单。

目标只有一个：

- 把 Dataview projection 体系一次性收敛到长期最优终态

这里明确排除两类做法：

- 不做兼容过渡层
- 不保留第二套实现并行存在

也就是说，迁移完成后，代码库里只允许剩下一套 projection 架构。


## 2. 不可违反的硬约束

迁移过程中必须始终满足下面这些约束。

### 2.1 单一 active-view 模型

- 全局同一时刻只有一个 active view
- `activeViewId` 是 engine 正式状态
- `activeViewId` 是持久化数据的一部分
- 所有 query、layout、calculation 都只围绕 active view 工作


### 2.2 公开接口边界

- `engine.read.*` 只暴露 raw state
- `engine.project.*` 只暴露 active-view derived projection
- `engine.project.*` 使用扁平命名空间
- 不再对外暴露 keyed per-view projection 能力


### 2.3 禁止保留的旧模式

迁移结束后，下面这些模式必须彻底消失：

- `read.xxx.get(viewId)` 形式的 projection read
- keyed view projection store
- per-view projection cache
- current-view adapter runtime
- React 层的 current-view projection store
- “大而全”的 `resolveViewProjection(document, viewId)` 主模型
- projection 各自 `applyChange` 的 patch 网络
- 同时存在“新 project pipeline”和“旧 projection/view pipeline”


### 2.4 不接受的迁移方式

下面这些方式明确不允许采用：

- 先引入新实现，再长期保留旧实现兜底
- 通过 feature flag 保留两套 projection 路径
- 通过 adapter 把旧 projection 包一层后继续暴露
- 在 engine 内部同时维护 active pipeline 和 per-view pipeline
- 在 React 层额外组装一个长期存在的“大 currentView store”


## 3. 终态定义

迁移完成后，公开面只应剩下下面这些核心结构。

### 3.1 Read

```ts
engine.read.document
engine.read.activeViewId
engine.read.activeView
engine.read.record
engine.read.field
engine.read.view
```

如果保留列表读取，也只允许是 raw list：

```ts
engine.read.recordIds
engine.read.fieldIds
engine.read.viewIds
```


### 3.2 Project

```ts
engine.project.view
engine.project.search
engine.project.filter
engine.project.sort
engine.project.group
engine.project.records
engine.project.sections
engine.project.appearances
engine.project.fields
engine.project.calculations
```

每个 projection 的协议保持一致：

```ts
type ReadProjection<T> = {
  get(): T
  subscribe(listener: () => void): () => void
}
```


### 3.3 Write

```ts
engine.view.open(viewId)
```


## 4. 每个 projection 的最终职责

迁移时不要重新发明“大聚合 view projection”，每个 projection 只做自己的事。

### 4.1 `engine.project.view`

- 只提供 active view 的最小展示信息
- 建议只保留 `id`、`name`、`type`
- 不演化成第二个完整 `View`


### 4.2 `engine.project.search`

- 只提供 search 所需 projection
- 包含 `query`、`fields`、`active` 一类结果


### 4.3 `engine.project.filter`

- 只提供 filter 所需 projection
- 包含 `mode`
- 包含 rules 及 label / preset / editor / effective / valueText


### 4.4 `engine.project.sort`

- 只提供 sort rules
- 包含 field labels
- 包含 `active`


### 4.5 `engine.project.group`

- 只提供 group 所需 projection
- 包含 `field`
- 包含 `mode`
- 包含 `bucketSort`
- 包含 `bucketInterval`
- 包含 `showEmpty`
- 包含 available modes / bucket sorts


### 4.6 `engine.project.records`

- 只提供 active view 的 record-set projection
- 以 `recordId[]` 为核心
- 至少包含 `derivedIds`、`orderedIds`、`visibleIds`


### 4.7 `engine.project.sections`

- 只提供 section descriptors
- 只提供 bucket metadata
- 只提供 collapsed / visible 结果


### 4.8 `engine.project.appearances`

- 只提供 `byId`
- 只提供 `ids`
- 只提供 `indexOf / prev / next / range / sectionOf`


### 4.9 `engine.project.fields`

- 只提供 active view 的 visible fields
- 只提供 visible field ids / field objects / 索引辅助函数


### 4.10 `engine.project.calculations`

- 只提供 `calculationsBySection`


## 5. 目标目录结构

迁移完成后，projection 主结构应收敛到：

```txt
dataview/src/engine/
  project/
    runtime.ts
    view.ts
    search.ts
    filter.ts
    sort.ts
    group.ts
    records.ts
    sections.ts
    appearances.ts
    fields.ts
    calculations.ts
```

职责边界固定如下：

- `runtime.ts` 负责统一重建和发布
- 其余文件只负责对应 projection 的纯构建逻辑


## 6. 统一重建模型

这部分不是“可选实现偏好”，而是最终结构要求。

### 6.1 view 切换

当 `activeViewId` 变化时，直接重建整条 active pipeline：

1. resolve active view
2. build search
3. build filter
4. build sort
5. build group
6. build record set
7. build sections
8. build appearances
9. build fields
10. build calculations
11. 发布所有 projection store

这里不做：

- keyed reuse
- cross-view cache
- incremental patch


### 6.2 document 变化

当 document 变化时：

- 只重建当前 active view 这条 pipeline

不是：

- 重建所有 view projection
- 路由变化到多套 projection store
- 让每个 projection 自己理解 change 再 patch


## 7. 迁移清单

下面的任务不是建议，而是必须完成的迁移项。

### 7.1 收敛 engine 目录

- 新建或整理 `dataview/src/engine/project/*`，让 projection 主结构全部进入这个目录
- 把 active-view projection 的纯 builder 分别落到 `view.ts`、`search.ts`、`filter.ts`、`sort.ts`、`group.ts`、`records.ts`、`sections.ts`、`appearances.ts`、`fields.ts`、`calculations.ts`
- 让 `runtime.ts` 成为唯一的 projection 发布入口


### 7.2 删除旧的中心模型

- 删除 `projection/view` 作为 projection 主中心的角色
- 删除按 `viewId` 计算完整聚合 projection 的中心函数
- 删除把 `view + schema + appearances + sections + fields + calculationsBySection` 作为 engine 主语义的模型

如果某些交互 helper 仍有价值，可以保留为小工具，但必须满足：

- 不再成为 projection 主入口
- 不再承载“大 current view projection”语义
- 不再要求调用方传入 `viewId` 来拿完整 projection


### 7.3 让 `engine.project.*` 成为唯一投影来源

- 所有 active-view projection 读取统一改为 `engine.project.*`
- 禁止从 raw document 直接现算 query/layout/calculation projection
- 禁止在服务层保留另一套独立的 current-view projection 解析路径


### 7.4 清理 service 层

- `engine/services/*` 不再直接依赖“大 view projection”中心对象
- service 层只消费明确分项的 active-view projection，或消费纯 helper 所需的最小输入
- 移除任何“先 resolve 一个完整 current view projection 再从里面拆字段”的逻辑


### 7.5 清理 React 层

- React 直接订阅 `engine.read.activeView` 和 `engine.project.*`
- 删除 current-view adapter store
- 删除长期存在的大 `currentView` runtime store
- 删除“为了补 engine 缺口而在 React 层长期组装 projection”的模式

局部组件可以在消费层临时组合几个 projection 值，但这不能变成新的公共状态模型。


### 7.6 删除 keyed per-view 心智

- 所有 projection API 都不再接收 `viewId`
- 不再维护非 active view 的完整 projection 能力
- 不再为了“未来也许会同时显示多个 view”保留结构余量


### 7.7 清理命名

- 对外接口中不使用 `runtime`
- 对外接口中不使用 `family`
- 对外接口中不使用 `registry`
- 对外接口中不使用 `resolved`
- 对外接口中不使用 `derived`
- 对外接口中不使用 `currentView`
- 对外接口中不使用 `Projection` 作为字段后缀

这些概念可以存在于内部文件名或局部实现中，但不能成为长期公开 API 主体。


## 8. 删除清单

迁移收尾阶段必须执行的删除项如下。

### 8.1 删除的能力

- keyed projection read
- per-view projection cache
- current-view adapter runtime
- projection patch 网络
- 双轨 projection 实现


### 8.2 删除的概念

- “每个 view 各有一套 projection”
- “React 再补 current view”
- “engine project 之外还要有大 view projection”
- “迁移期间先兼容一下旧调用方”


### 8.3 删除的接口形态

- `read.search.get(viewId)`
- `read.filter.get(viewId)`
- `read.sort.get(viewId)`
- `read.group.get(viewId)`
- `read.viewProjection.get(viewId)`
- 任何等价的 keyed projection API


## 9. 验收标准

迁移完成后，必须同时满足下面全部条件。

### 9.1 结构验收

- engine 里只有一条 active-view projection pipeline
- `engine.project.*` 是唯一 projection 公开面
- 不存在第二套 projection 主实现


### 9.2 语义验收

- `engine.read` 只包含 raw state
- `engine.project` 只包含 active-view projection
- view switch 触发 active pipeline 全量重建
- document sync 只重建 active pipeline


### 9.3 代码库验收

- 搜索不到 keyed per-view projection 入口
- 搜索不到 current-view adapter runtime
- 搜索不到长期保留的大 `resolveViewProjection(document, viewId)` 主模型
- 搜索不到“双轨兼容”相关分支


## 10. 一句话原则

这次迁移不是把旧 projection 架构再包一层，而是直接把旧架构删掉。

最终只允许存在这一套模型：

- 一个 active view
- 一条 active projection pipeline
- 一组扁平的 `engine.project.*`

