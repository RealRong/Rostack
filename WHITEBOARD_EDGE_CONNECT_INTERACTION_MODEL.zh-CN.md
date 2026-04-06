# Whiteboard Edge 连接交互模型

## 目标

whiteboard 的 edge 连接交互收敛为一套长期稳定、复杂度低的模型：

- 不再依赖“当前 selected node”决定连接点显示
- 鼠标靠近哪个 node，就激活哪个 node 的连接反馈
- 只保留两种连接命中：`outline` 与 `handle`
- 删除 `body auto`、蓝框、hold，以及相关抑制状态
- 预览语义与提交语义保持一致

## 最终模型

连接结果只保留 3 种状态：

```ts
type ConnectMode =
  | 'free'
  | 'outline'
  | 'handle'
```

含义：

- `free`：没有命中 node，edge end 是自由点
- `outline`：靠近 node 边界，弱吸附到边
- `handle`：靠近四个边中心点之一，强吸附到点

优先级固定：

```txt
handle > outline > free
```

## 现有语义复用

edge end 继续复用既有协议：

```ts
type EdgeEnd =
  | { kind: 'point'; point: Point }
  | { kind: 'node'; nodeId: NodeId; anchor?: EdgeAnchor }
```

提交约定：

- `free` -> `{ kind: 'point', point }`
- `outline` -> `{ kind: 'node', nodeId, anchor }`
- `handle` -> `{ kind: 'node', nodeId, anchor }`

这里不再使用 `node + anchor === undefined` 表达连接模式。那条语义仍可继续留给别的场景，但不属于 edge connect 交互协议。

## 运行时状态

editor 侧的最小运行时状态收敛为：

```ts
type EdgeConnectRuntimeState = {
  focusedNodeId?: NodeId
  resolution: ConnectResolution
}
```

说明：

- `focusedNodeId`：当前因 pointer 接近而激活反馈的 node
- `resolution`：当前帧的连接结果

不再维护以下状态：

- `suppressedBodyNodeId`
- hold timer
- `oppositeWorld`
- body mode 相关的额外 UI 状态

## 正式类型

```ts
type EdgeConnectConfig = {
  activationPaddingScreen: number
  outlineSnapMin: number
  outlineSnapRatio: number
  handleSnapScreen: number
}

type ConnectResolution =
  | {
      mode: 'free'
      pointWorld: Point
    }
  | {
      mode: 'outline'
      nodeId: NodeId
      pointWorld: Point
      anchor: EdgeAnchor
    }
  | {
      mode: 'handle'
      nodeId: NodeId
      pointWorld: Point
      anchor: EdgeAnchor
      side: EdgeAnchor['side']
    }

type EdgeConnectEvaluation = {
  focusedNodeId?: NodeId
  resolution: ConnectResolution
}
```

## Core 几何规则

### 1. Focus 规则

`focusedNodeId` 只负责“哪个 node 需要显示四个 handles”。

命中条件：

- pointer 落在 node 的激活外扩范围内
- 激活阈值取以下三者最大值：
  - `activationPaddingScreen`
  - `outline` 的弱吸附阈值
  - `handle` 的强吸附阈值

比较距离时统一使用 node 的外部 bounds。

### 2. Outline 规则

`outline` 是对 node 真实 outline 的弱吸附。

规则：

- 用统一几何 API 把 pointer 投影到 node outline
- 若投影距离小于等于 outline 阈值，则命中
- 命中后返回投影点与对应 anchor

阈值：

```ts
threshold = max(
  outlineSnapMin(world),
  min(rect.width, rect.height) * outlineSnapRatio
)
```

### 3. Handle 规则

`handle` 是四个边中心点的强吸附。

规则：

- 只计算 `top / right / bottom / left` 四个固定 anchor
- pointer 到某个 handle 的距离小于等于 `handleSnapScreen(world)` 时命中
- 多个 handle 同时命中时取最近者

### 4. 优先级

同一帧内 evaluator 先解 `handle`，再解 `outline`，最后回退 `free`。

这保证：

- 点附近表现稳定，不会被 outline 抢走
- 进入 node 内部时仍能投影到最近边
- 不需要 body mode 也能完成连接

## Editor 协议

`snap.edge.connect(...)` 的正式输入收敛为：

```ts
type EdgeSnapRuntime = {
  connect: (input: {
    pointerWorld: Point
  }) => EdgeConnectEvaluation
}
```

说明：

- connect evaluator 只依赖当前 pointer
- hover 与 active connect 共用同一 evaluator
- editor session 不再持有 hold 任务

## Overlay 规则

### Node Overlay

node overlay 只负责两件事：

- 根据 `focusedNodeId` 找到当前 node
- 永远显示该 node 的四个 connect handles

强调：

- 不再渲染 body 蓝框
- 不再渲染整 node 遮罩
- handle 高亮仅由 `resolution.mode === 'handle'` 决定

### Edge Overlay

edge overlay 只负责：

- 拖拽预览线
- snap 点预览

其中 snap 点只在以下模式显示：

- `outline`
- `handle`

## 用户可见行为

### 新建 edge

- 从 background 开始拖拽：默认 `free`
- 靠近 node 边：进入 `outline`
- 靠近四个中心点：进入 `handle`
- 松手时按当前 resolution 提交

### 从 node 开始拖拽

- 从 connect handle 开始：起点固定在对应 side
- 从 node body / shell 开始：起点按 pointer 投影到最近 outline

### reconnect

- 端点拖拽过程与新建完全共用同一 evaluator
- 不存在 reconnect 专属 body 规则

## 实施边界

以下内容不再保留：

- `body` connect mode
- `holdToSuppressMs`
- `suppressedBodyNodeId`
- `oppositeWorld`
- 蓝框和整 node 淡色遮罩

## 验收标准

- 普通 edge 可以 background -> background 新建
- 普通 edge 可以 background -> node outline 新建
- 普通 edge 可以 node handle -> node handle 新建
- 已连接 edge 可以正常 reconnect
- 拖拽过程中，靠近 node 时四个 handles 会出现在目标 node 上
- 靠近 handle 时高亮对应 side
- 不再出现 body 蓝框或整 node 遮罩
