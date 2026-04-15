Plain Text DOM 主导布局方案 — 评审意见
总体判断

核心思路完全正确，且与行业主流一致。 这份方案抓住了最关键的一点：plain text 的高度是排版结果而非用户输入，不应该被持久化。

方案质量很高，问题诊断准确、解决方向正确、分层清晰。下面从四个维度展开。

一、与行业标准对比
Figma
Figma 的文本有三种 resize 模式：

模式	Width	Height	对应你方案中的…
Auto Width	由内容撑开	由内容撑开	widthMode: 'auto' ✅
Auto Height	用户固定	由内容撑开	widthMode: 'wrap' ✅
Fixed Size	用户固定	用户固定（溢出裁切）	你方案中不存在 ⚠️
NOTE

你方案只保留了 auto 和 wrap 两种模式，没有 Figma 的 Fixed Size（固定宽高+溢出裁切）。这对 plain text 来说是合理的简化——白板场景很少需要裁切文本。但如果未来需要支持，模型扩展也很自然（加一个 widthMode: 'fixed' + authored height）。

tldraw
tldraw 的文本节点模型与你的方案高度一致：

Auto-size 模式：宽高都由内容决定（= 你的 auto）
Fixed-width 模式：宽度固定、高度自动增长（= 你的 wrap）
使用隐藏 DOM 元素（TextManager）做测量，和你提到的 "measurement host" 方式相同
测量结果回收到统一 store，下游统一消费——和你的 computedRect 完全对等
scale 时直接调整 fontSize，而非拉伸 box——和你的 scale-xy 语义一致
TIP

你的方案和 tldraw 在模型层面几乎同构，说明这是业界验证过的成熟模式。

Excalidraw
Excalidraw 的文本元素有一个 autoResize: boolean 标志：

autoResize = true：宽高都由内容决定（= 你的 auto）
手动拖拽边界后 autoResize = false：宽度固定、文本自动换行（≈ 你的 wrap）
同样使用 DOM / Canvas 测量文本尺寸
width 和 height 存在于元素数据中，但在 autoResize 模式下是计算值，不是用户输入值
Excalidraw 选择把计算后的宽高仍然写回元素数据（便于渲染和碰撞检测），这和你方案中"不持久化 height"的策略略有分歧。

IMPORTANT

Excalidraw 的做法是把 measured 宽高写回 element data 但标记为"computed"。 你的方案选择完全不持久化 height、只放在 runtime computed layer——这在语义上更干净，但在实现上需要确保 computedRect 在所有场景下都能及时产出（尤其是首帧渲染、协作同步场景）。这是一个需要注意的风险点，见下文讨论。

小结
维度	Figma	tldraw	Excalidraw	你的方案
text 高度是否 authored	❌（auto-h 模式下不是）	❌	❌（autoResize 时）	❌ ✅
宽度模式	3 种	2 种	2 种	2 种 ✅
scale 折算进 fontSize	✅	✅	✅	✅
上下 resize 禁用	✅（auto-h 下）	✅	✅	✅
统一 computed geometry	✅	✅	✅	✅
结论：你的方案完全符合行业常规，甚至比一些开源实现（Excalidraw）在语义层面更清晰。

二、设计方案中做得好的地方
根因诊断精准——"plain text 被同时当成了排版节点和几何节点"是对问题最好的一句话总结
RectAxisSource 的分类模型极其简洁——'authored' | 'layout' 两个值就能覆盖所有节点类型
node 分类矩阵清晰明了，后续新增节点类型可以直接查表
删除清单非常具体——给出了具体文件路径和要删什么，降低了执行歧义
六阶段实施顺序合理——先立共享层、再切模型、再接 backend，最后清旧实现，风险可控
三、可以进一步简化的地方
1. PlainTextLayoutInput 中的 anchor 可以不属于 layout backend 的输入
ts
// 现在的设计
type PlainTextLayoutInput = {
  nodeId: string
  x: number; y: number; rotation: number
  text: string; fontSize: number
  widthMode: 'auto' | 'wrap'
  wrapWidth?: number
  anchor?: { ... }  // ← 这个
}
anchor 只用于 transform 手势中根据锚点回算 x / y。这件事完全可以由 transform session 自己做，不需要塞进 layout backend。

Layout backend 只关心 "给定输入，输出宽高"，位置回算是 transform 层的职责。拆开后：

PlainTextLayoutBackend 更纯粹——input 只有 text + fontSize + widthMode + wrapWidth，output 只有 width + height
x / y 的解算由 transform session 基于 anchor + measuredSize 自行完成
runtime computedRect 再把最终 x / y / w / h 合并
这样 layout backend 就变成一个无状态的纯函数，更容易测试和复用。

2. SharedNodeLayoutContract 泛型可能过度设计
ts
type SharedNodeLayoutContract<TAuthored> = {
  authored: TAuthored
  outerRectSource: { width: 'authored' | 'layout'; height: 'authored' | 'layout' }
  computedRect: Rect
}
在实际代码里，TAuthored 对每种节点类型都不一样，下游消费的又只是 computedRect——这个泛型 contract 在类型系统里能发挥的作用有限。

更简单的做法：不需要一个通用的泛型 contract 类型，只需要确保所有节点通过同一个接口暴露 computedRect 即可：

ts
interface ComputedLayoutProvider {
  getComputedRect(nodeId: string): Rect | undefined
}
outerRectSource 可以沉淀为节点注册时的配置信息，不需要 runtime 携带。

3. 文档篇幅可以大幅压缩
这份文档有 1115 行，核心设计其实可以用 200 行讲完。大量内容是同一个结论的反复论述：

"删除旧模型与旧链路"和"必须删除的旧实现清单"内容高度重叠
"设计原则"、"这套模型能否下沉"、"最终保留的模型"三个章节反复把同一件事说了三遍
"最终交互语义"可以直接合并进"设计原则"
TIP

建议最终落地版本按 设计原则 → 数据模型 → 交互语义 → 实施阶段 → 删除清单 → 验收标准 六段式精简，每段只出现一次。

四、需要注意的风险点
1. 首帧渲染的 computedRect 不可用问题
如果 height 不持久化，那么节点挂载前 computedRect 不存在。以下场景需要考虑：

初始加载大量节点：selection / snap / viewport culling 需要 rect 才能工作，但 DOM 还没 mount
协作同步：对端修改了 text 内容，本端还没 re-layout
Undo/Redo：恢复一个 text 节点后，在 DOM layout 完成前 rect 不可用
行业做法：

tldraw 用隐藏 DOM 元素同步测量（在 render 前就拿到尺寸）
Excalidraw 把 computed 宽高写回 element data（冗余但能保证首帧可用）
建议：在 PlainTextAuthoredState 中保留一个可选的 cachedSize?: { width: number; height: number }，作为 layout backend 还没产出结果前的 fallback。这个字段语义上不是 authored，而是上次 layout 的快照。这样做的好处：

首帧渲染时有合理的初始尺寸
DOM mount 后立刻覆盖为真实测量值
协作同步时对端的 cached 值可以作为 hint
不违反"高度不是用户输入"的核心原则
2. Transform 手势期间的实时 DOM layout 性能
方案要求 resize-x 和 scale-xy 期间，每帧都要 DOM 重新排版并测量。如果是拖拽 60fps 的场景：

每帧改 fontSize 或 wrapWidth
DOM reflow
读取测量结果
更新 computedRect
重新渲染 selection / snap overlays
这条链路的延迟可能导致拖拽手感卡顿，尤其当画布上有大量节点时。

建议：

考虑在 transform 手势中用 CSS transform: scale() 做视觉预览，只在 commit 时才真正折算 fontSize 和重排
或者使用 requestAnimationFrame 节流 + 隐藏 DOM 测量（和 tldraw 的 TextManager 类似）
3. auto 模式下左右 resize 立即切到 wrap 的体验争议
方案规定："从 auto 开始拖左右边时，立即切到 wrap"。

这和 Figma 的行为一致，但有一个体验陷阱：用户可能只是想微调位置但不小心拖到了左右 handle，结果 text 从 auto 变成了 wrap，再也无法自动撑开。

Figma 的解法：双击右边 handle 可以切回 auto width。

建议：确保有一个便捷的方式恢复 auto 模式（双击 handle 或右键菜单），否则这是一个不可逆操作。

五、是否有更简单的方案？
没有本质上更简单的方案了。 你的方案已经是问题域的最小充分解：

两种宽度模式（auto / wrap）→ 不能再少
DOM 作为 layout backend → 浏览器环境下的最优选
computedRect 统一消费 → 不能再少一层
唯一能让方案看起来更简单的是把它写短。核心模型其实可以压缩到这几行：

plain text = {
  x, y, rotation, text, fontSize, widthMode, wrapWidth?
}
computedRect = DOMLayout(plain text authored state)
所有下游只消费 computedRect
设计问题本身不需要更简单的答案，需要的是更精简的表达。

六、总结
维度	评价
核心思路	✅ 正确且精准
行业对齐	✅ 与 Figma / tldraw 高度一致
模型简洁度	✅ 接近最小充分解
可执行性	✅ 删除清单和实施阶段划分合理
文档精简度	⚠️ 可以压缩一半以上
首帧 / 协作场景	⚠️ 需要 cachedSize fallback
拖拽性能	⚠️ 需要考虑 CSS scale 预览优化
auto→wrap 可逆性	⚠️ 需要补充恢复 auto 的交互