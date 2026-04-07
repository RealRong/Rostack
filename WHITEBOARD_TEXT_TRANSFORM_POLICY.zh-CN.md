# Whiteboard Text Transform Policy

## 目标

将 `text` 节点的交互语义收敛为一套稳定规则：

- 左右中点拖拽：只改文本框宽度，不改字号
- 上下中点拖拽：禁用
- 四个角拖拽：整体缩放，字号和框一起变
- 编辑态与非编辑态使用同一套宽度语义
- selection box 始终对应当前文本框，而不是进入编辑态后再跳一套规则

目标效果对齐 Miro 一类白板文本框，但实现尽量保持简单。

## 当前问题

当前 `text` 节点已经是 `DOM 渲染 + DOM 测量` 方案，这条路本身没有问题。

问题在于语义不统一：

- 单选时，`text` 走通用 `resize`
- 多选时，内容节点更偏向 `scale`
- 改字号时，通常只改 `fontSize`，不一定同步 `rect`
- 进入编辑态时，又会重新测量文本并预览 size

结果就是：

- 改字号后内容变大，但 selection box 可能不变
- 进入编辑态后，node 大小又突然自适应
- 当前 transform handles 也不是文本专用语义

这不是 DOM 难做，而是 transform policy 没定清楚。

## 设计原则

### 1. 不新增第三种宽度模式

继续只保留：

- `auto`
- `fixed`

不要引入：

- `fit`
- `wrap`
- `reflow`

这些都可以用现有语义表达，不需要额外扩展状态空间。

### 2. 文本框优先，不走通用 resize 语义

`text` 不是普通矩形图元。

它更像：

- 一个有宽度模式的文本框
- 外加一个可选的整体缩放行为

所以不应继续复用“8 个点都能 resize”的通用节点语义。

### 3. 编辑态与显示态必须共用同一套测量规则

一旦文本节点处于：

- `fixed`

那么无论是否在编辑态，都必须以当前框宽进行换行和测量。

一旦文本节点处于：

- `auto`

那么无论是否在编辑态，都必须按自动宽度测量，而不是只在编辑态启用。

### 4. API 命名要短

不引入大而全的：

- `TextTransformInteractionPolicy`
- `ResolvedTextResizeSemantics`

这类名字。

优先使用短名：

- `mode`
- `reflow`
- `scale`
- `handle`
- `measure`

## 目标语义

### 1. 左右中点：`reflow`

行为：

- 只改变 `rect.width`
- 不改变 `fontSize`
- 拖拽后将 `widthMode` 置为 `fixed`
- 根据新宽度重新测量高度

结果：

- 文本重新换行
- 文本框高度自动变化
- selection box 跟随最新测量结果

### 2. 上下中点：`none`

行为：

- 不显示
- 或显示但禁用

推荐直接不显示，最简单。

### 3. 四角：`scale`

行为：

- 视为整体缩放
- 同时更新 `fontSize`
- 同时更新框尺寸
- 按缩放后的字体和宽度重新测量高度

结果：

- 字号整体变大或变小
- 文本框也同步变化

### 4. 双击编辑

行为：

- 不切换 transform 语义
- 只进入文本编辑
- 当前节点是什么 `mode`，编辑时就继续按什么 `mode` 测量

这点很关键。

否则用户会看到：

- 显示态一套宽度
- 编辑态另一套宽度

## 数据模型

继续使用现有：

- `data.widthMode: 'auto' | 'fixed'`
- `style.fontSize`
- `fields.size.width`
- `fields.size.height`

不新增文本专用 transform 状态。

## 最小 API 方案

推荐只补很少几个短 API。

### 1. `readTextMode`

作用：

- 读取文本宽度模式

签名建议：

```ts
readTextMode(node): 'auto' | 'fixed'
```

可以直接复用现有 `readTextWidthMode`，也可以后续重命名为更短的 `readTextMode`。

### 2. `setTextMode`

作用：

- 写入文本宽度模式

签名建议：

```ts
setTextMode(node, mode): Node['data']
```

同样可以基于现有 `setTextWidthMode` 演进。

### 3. `resolveTextHandle`

作用：

- 将 handle 解析为文本节点的交互语义

签名建议：

```ts
resolveTextHandle(handle): 'reflow' | 'scale' | 'none'
```

规则：

- `left` / `right` => `reflow`
- `top` / `bottom` => `none`
- `top-left` / `top-right` / `bottom-left` / `bottom-right` => `scale`

### 4. `measureTextBox`

作用：

- 在给定内容、字体、宽度模式下测量最终框大小

签名建议：

```ts
measureTextBox({
  node,
  rect,
  content,
  source,
  fontSize
}): Size | undefined
```

这个 API 本质上就是现有 `measureTextNodeSize`，建议后续可短名化，但不必为了改名而重构。

## 实现分层

### 1. core：只定义文本语义，不处理 DOM

文件重点：

- `whiteboard/packages/whiteboard-core/src/node/text.ts`
- `whiteboard/packages/whiteboard-core/src/node/transform.ts`

职责：

- 文本宽度模式
- 文本 handle 语义
- 文本节点允许哪些 handles

建议：

- `text` 节点不要再返回通用 8 向 resize handles
- 直接返回：
  - 左
  - 右
  - 四角

### 2. editor：按 handle 分流到 `reflow` 或 `scale`

文件重点：

- `whiteboard/packages/whiteboard-editor/src/interactions/transform.ts`

职责：

- 在 transform 启动时判断当前节点是不是单选 `text`
- 如果是，就不要直接走通用 `single-resize`
- 而是按 handle 进入：
  - `text-reflow`
  - `text-scale`

这里不一定非要新增公开 interaction type。

更简单的做法是：

- 仍复用单选 transform 主流程
- 但在更新逻辑里对 `text` 做专门分支

只要分支清楚即可，不需要为了“命名完整”再扩一层框架。

### 3. react：继续负责 DOM 测量

文件重点：

- `whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx`
- `whiteboard/packages/whiteboard-react/src/features/node/dom/textMeasure.ts`

职责：

- 提供真实文本源 DOM
- 使用浏览器排版结果测量文本框
- 编辑态预览和提交

这层不需要推翻。

只要保证：

- `fixed` 时按当前宽度测量
- `auto` 时按自动宽度测量
- `fontSize` 改变时可同步触发测量

## 两种变换的实现

### 1. `reflow`

输入：

- 当前 `rect`
- 拖拽后的目标宽度
- 当前 `fontSize`
- 当前文本内容

输出：

- `widthMode = fixed`
- `size.width = nextWidth`
- `size.height = measuredHeight`

流程：

1. 根据拖拽锚点算出新宽度
2. 宽度 clamp 到最小值
3. 将节点视为 `fixed`
4. 用新宽度重新测量文本高度
5. 提交新 size

关键点：

- `reflow` 不改 `fontSize`
- `reflow` 只改宽度和测量后的高度

### 2. `scale`

输入：

- 当前 `rect`
- 当前 `fontSize`
- 缩放比例
- 当前文本内容

输出：

- `fontSize = nextFontSize`
- `size.width = scaledWidth`
- `size.height = measuredHeight`

流程：

1. 根据角点拖拽算出 scale ratio
2. 计算 `nextFontSize`
3. 计算 `nextWidth`
4. 用 `nextFontSize + nextWidth` 重新测量高度
5. 提交 `fontSize` 和 `size`

关键点：

- `scale` 是文本对象级别缩放
- 高度不要直接线性缩放后就结束
- 应以缩放后的排版结果重新测量

这样结果更稳定，也更接近真实文本对象。

## 改字号命令的语义

当前最大断点之一是：

- toolbar 改 `fontSize`
- 但 `rect` 不一定同步更新

建议统一规则：

- 对 `text` 节点执行 `setSize(fontSize)` 时，同时测量并提交 `size`
- `fixed`：保持当前宽度，只更新高度
- `auto`：重新测量宽高

这样：

- toolbar 改字号
- corner scale
- 编辑提交

三条链路都会收敛到同一套测量规则。

## handle 显示策略

推荐最终只给单选 `text` 显示：

- 左
- 右
- 左上
- 右上
- 左下
- 右下

不显示：

- 上
- 下

这是最简单、最容易让用户理解的方案。

## 对多选的处理

多选不建议引入文本专用复杂语义。

继续保留：

- 多选整体 `scale`

原因很简单：

- 多选时做逐个文本 `reflow`，语义会非常混乱
- 用户对多选的直觉本来就是整体缩放

因此文本专用规则只处理：

- 单选 `text`

## 建议落地步骤

### 第一步

先把单选 `text` 的 handles 改对：

- 左右 + 四角
- 去掉上下

### 第二步

把单选 `text` transform 更新逻辑拆成：

- `reflow`
- `scale`

### 第三步

把字号修改命令也接入统一测量：

- 改字号后同步 rect

### 第四步

检查编辑态预览和 commit：

- 不要再出现进入编辑态才突然重新适配的跳变

## 不建议做的事

- 不建议为文本再扩一个完整 toolbar / transform 子框架
- 不建议引入超过 `auto | fixed` 的第三种宽度模式
- 不建议把文本排版改成纯 canvas 计算
- 不建议在多个层里各自散写一份文本测量逻辑

## 一句话方案

把 `text` 明确建模成：

- 左右可 `reflow`
- 四角可 `scale`
- 上下不可拖
- 一切尺寸变化最终都回到同一个 `measureTextBox(...)`

这样实现最短，规则最稳，后续维护成本也最低。
