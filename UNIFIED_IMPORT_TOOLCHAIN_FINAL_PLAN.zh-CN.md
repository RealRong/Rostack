# Unified Import Toolchain Final Plan

> 本文件是仓库当前唯一正式的长期导入与工具链方案。  
> 它直接取代 [PATH_RESOLUTION_LONG_TERM_PLAN.zh-CN.md](/Users/realrong/Rostack/PATH_RESOLUTION_LONG_TERM_PLAN.zh-CN.md) 中“包内以 `package.json#imports` 为主”的旧长期判断。  
> 后续 `shared`、`dataview`、`whiteboard` 的所有导入、`package.json`、测试、构建、脚本统一以本文件为准。

## 1. 最终结论

这个仓库的最终统一方案不是：

- 根级 `tsconfig.paths`
- 大量 `package.json#imports`
- 各工具各写一套 alias
- Node 裸跑脚本再额外做一次路径修补

这个仓库的最终统一方案只有一套：

- 跨包导入：真实 workspace package 名
- 包内导入：每个包本地 `tsconfig.json` 的局部 `paths`
- App / demo：`vite-tsconfig-paths`
- 测试：`Vitest`
- Node 脚本 / bench / 本地执行：`tsx`
- 包构建：`tsdown`
- `package.json` 只保留精简 `exports`
- `package.json#imports` 不再作为主机制，最终从所有包中删除

如果只保留一句话，就是：

不要再让 `package.json#imports` 或根级 alias 承担包内主路由；最终统一方案是“跨包真实包名 + 包内局部 `tsconfig.paths` + Vite/Vitest/tsx/tsdown 跟随同一套 `tsconfig`”。

## 2. 为什么正式改判

之前把长期方向押在 `package.json#imports` 上，理论上更接近 Node 原生能力，但在这个仓库里有三个现实问题：

- 一旦想把 `imports` 收敛成少量 namespace，源码内部导入通常就要显式补 `.ts` / `.tsx`
- 如果不想在源码里补扩展名，就会退化成在 `package.json` 里列很多显式文件映射，形成新的配置膨胀
- Node、测试、构建、编辑器虽然都能“被适配”，但工程摩擦明显高于 `tsconfig.paths + 插件/运行时` 方案

而用户现在明确接受：

- 可以加插件
- 可以放开“全部原生共享同一套 Node 子路径映射”的限制
- 不在乎迁移成本
- 只要最终最统一、最省维护、最符合实际开发体验

因此最终长期方案正式改为：

- `package.json#exports` 只负责对外 API
- 包内短路径统一收敛到包本地 `tsconfig.paths`
- 运行时与工具链统一通过行业常规工具跟随 `tsconfig`

## 3. 最终推荐技术栈

### 3.1 App / demo

- `Vite`
- `vite-tsconfig-paths`

正式规则：

- 所有 app / demo 不再手写 `resolve.alias`
- 所有 app / demo 都通过 `vite-tsconfig-paths` 跟随对应包的 `tsconfig`

### 3.2 测试

- `Vitest`

正式规则：

- 不再使用 `node --test` 作为主测试框架
- 不再保留为了让 `node --test` 识别源码 alias 而存在的预编译/重写脚本
- React 包、纯逻辑包、Node 场景包全部统一纳入 `Vitest`

说明：

- 浏览器环境测试使用 `jsdom`
- 纯逻辑/Node 测试使用 `node` 环境
- `Vitest` 通过 Vite 插件链直接复用 `vite-tsconfig-paths`

### 3.3 Node 脚本 / bench / 本地执行

- `tsx`

正式规则：

- bench、一次性脚本、本地调试脚本、开发期 Node 执行统一走 `tsx`
- 不再保留基于手写路径重写的 `.tmp` 构建脚本
- 不再为裸 `node` 保留第二套路径兼容层

### 3.4 包构建

- `tsdown`

正式规则：

- `shared/*`、`dataview/*`、`whiteboard/*` 这类库包的最终统一构建器收敛到 `tsdown`
- 不再继续围绕 `tsup` 累积新的路径或 alias 特判
- 构建配置统一跟随 `tsconfig` 与少量 `exports`

备注：

- 这不是路径系统本身的一部分
- 但如果仓库已经决定全面统一工具链，库构建器也应一起统一

## 4. 唯一允许的导入模型

最终源码里只允许两类主导入：

### 4.1 跨包导入

统一使用真实 workspace package 名。

正式包名族如下：

- `@shared/core`
- `@shared/dom`
- `@shared/react`
- `@shared/ui`
- `@dataview/core`
- `@dataview/engine`
- `@dataview/meta`
- `@dataview/react`
- `@dataview/table`
- `@whiteboard/core`
- `@whiteboard/engine`
- `@whiteboard/editor`
- `@whiteboard/react`
- `@whiteboard/collab`

规则：

- 不允许跨包相对路径
- 不允许通过根 alias 直连其他包源码
- 不允许 app 或测试绕过 `exports` 直接吃别的包内部文件

### 4.2 包内导入

统一使用包本地 alias。

最终别名前缀一律采用全局唯一命名，避免不同包里都出现语义重复的 `#core/*`、`#react/*`。

正式规则如下：

- `@shared/core` 内部：`#shared-core/*`
- `@shared/dom` 内部：`#shared-dom/*`
- `@shared/react` 内部：`#shared-react/*`
- `@shared/ui` 内部：`#shared-ui/*`
- `@dataview/core` 内部：`#dataview-core/*`
- `@dataview/engine` 内部：`#dataview-engine/*`
- `@dataview/meta` 内部：`#dataview-meta/*`
- `@dataview/react` 内部：`#dataview-react/*`
- `@dataview/table` 内部：`#dataview-table/*`
- `@whiteboard/core` 内部：`#whiteboard-core/*`
- `@whiteboard/engine` 内部：`#whiteboard-engine/*`
- `@whiteboard/editor` 内部：`#whiteboard-editor/*`
- `@whiteboard/react` 内部：`#whiteboard-react/*`
- `@whiteboard/collab` 内部：`#whiteboard-collab/*`

为什么选择“全局唯一前缀”而不是继续用简短的 `#core/*`、`#react/*`：

- 更直观，不依赖“当前文件属于哪个包”的上下文才能理解
- 在 monorepo 编辑器、多 tsconfig、测试聚合配置里更不容易混淆
- 后续做 Vitest workspace、脚本扫描、codemod 时更稳定

## 5. 相对路径的最终规则

最终正式规则：

- TypeScript / TSX / JS / JSX 代码导入里，不再允许跨目录相对路径作为主写法
- 包内代码统一使用包本地 alias
- 跨包代码统一使用真实包名

只保留少量例外：

- 紧邻同目录的非模块资产，例如 `./style.css`、`./families.json`
- 极个别构建工具要求的相对资源路径

也就是说，最终状态下：

- `../../..`
- `../foo/bar`
- `./deep/module`

这类代码路径不是长期写法，应该统一消失。

## 6. package.json 的最终职责

### 6.1 `exports`

`exports` 只负责对外公共 API。

长期原则：

- 默认只暴露 `.`
- 确实需要长期稳定子入口时，再增加少量子路径
- 不再把内部 feature 目录树镜像到 `exports`

推荐目标：

- `@shared/core`、`@shared/dom`、`@shared/react`：只保留 `.`
- `@shared/ui`：保留被外部稳定消费的少量 UI 子入口
- `@dataview/react`、`@whiteboard/react`：优先只保留 `.`
- `@whiteboard/editor`：保留 `.` 与 `./draw`
- `@whiteboard/engine`：只保留真正公共的少量入口，例如 `.`、`./types`
- `@whiteboard/core` 与 `@dataview/core`：保留稳定业务 API 面，但不再按内部目录无限扩散

### 6.2 `imports`

`imports` 最终不再承担包内 alias 主机制。

正式结论：

- 所有包里的 `imports` 最终应删除
- 不再允许“某些包走 `tsconfig.paths`，某些包走 `package.json#imports`”的双轨状态
- 如果某个包还保留大量 `imports`，视为未迁移完成

### 6.3 其他字段

最终统一要求：

- `files` 只保留真正需要发布/消费的目录
- `types`、`main`、`module` 等由统一构建器产物收敛
- 不再为 alias 额外添加自定义字段或兼容字段

## 7. tsconfig 的最终职责

### 7.1 根级 tsconfig

根级 `tsconfig.base.json` 只保留公共编译选项：

- `strict`
- `moduleResolution`
- `jsx`
- `resolveJsonModule`
- `isolatedModules`
- `target`

正式禁止：

- 根级 `paths`
- 根级“给整个 monorepo 兜底”的 alias

### 7.2 包级 tsconfig

每个包都必须拥有自己的独立 `tsconfig.json`，并在本包内部定义唯一 alias。

推荐最小形态：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "rootDir": "src",
    "outDir": "dist",
    "paths": {
      "#whiteboard-react/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

dataview 需要特别调整：

- 不再保留“一个 `dataview/tsconfig.json` 覆盖所有 dataview 包源码”的模式作为主检查方式
- `dataview/packages/dataview-*` 每个包都要有独立 tsconfig
- dataview workspace 的 `typecheck` 脚本改成按包串行或使用 project references

原因：

- 如果多个包在一个 tsconfig 里混编，就会自然诱导出共享 alias 或相互污染
- 最终统一方案要求 alias 的作用域严格收敛在包内部

## 8. shared / dataview / whiteboard 的最终目录与边界

### 8.1 shared

保持：

- `shared/core`
- `shared/dom`
- `shared/react`
- `shared/ui`

最终规则：

- 每个包自己的 tsconfig、自建 alias、自有 build/test 入口
- `shared/ui` 是唯一 UI primitives 来源
- `shared` 不再向根目录外暴露第二套 UI 命名

### 8.2 dataview

保持：

- `dataview/packages/dataview-core`
- `dataview/packages/dataview-engine`
- `dataview/packages/dataview-meta`
- `dataview/packages/dataview-react`
- `dataview/packages/dataview-table`

最终规则：

- 目录名继续保留 `dataview-*` 前缀
- 包名继续保留 `@dataview/*`
- 每个包独立 tsconfig、独立 alias、独立 build/test/typecheck 单元
- 删除当前围绕 `.tmp/group-test-dist` 的测试中间层
- 删除 `prepare-test-dist.cjs`
- dataview 测试统一切到 Vitest

### 8.3 whiteboard

保持：

- `whiteboard/packages/whiteboard-core`
- `whiteboard/packages/whiteboard-engine`
- `whiteboard/packages/whiteboard-editor`
- `whiteboard/packages/whiteboard-react`
- `whiteboard/packages/whiteboard-collab`

最终规则：

- `whiteboard-react` 删除当前大量 `imports` 显式映射
- `whiteboard-engine` 删除当前少量 `imports`
- `whiteboard-core`、`whiteboard-editor`、`whiteboard-collab` 如需内部 alias，也统一走包级 tsconfig
- 所有包内部相对路径系统性收敛到包内 alias

## 9. 各层工具链的最终职责边界

### 9.1 TypeScript / IDE

- 读取包本地 `tsconfig.paths`
- 不从根级共享 alias
- 不依赖 `package.json#imports`

### 9.2 Vite / demo

- 通过 `vite-tsconfig-paths` 跟随 tsconfig
- 不手写 `resolve.alias`

### 9.3 Vitest

- 通过 Vite 配置复用 `vite-tsconfig-paths`
- 覆盖 browser/jsdom/node 三类测试场景
- 替代 `node --test`

### 9.4 tsx

- 执行所有需要源码 alias 的脚本与 bench
- 替代“先转译再改 require 路径”的中间脚本链路

### 9.5 tsdown

- 统一库包构建输出
- 配置围绕入口与产物，而不是围绕 alias 打补丁

## 10. 必须删除的旧模型

这次迁移的正式要求是“不兼容、不保留双轨”。

因此以下内容最终必须全部删除：

- 所有包中的 `package.json#imports`
- 根级 `tsconfig.base.json` 历史 `paths`
- app 级手写 `vite.resolve.alias`
- 依赖 `node --test` + 手工转译 + 手工重写 require 的测试链路
- dataview 的 `.tmp/group-test-dist` 模型
- `dataview/scripts/prepare-test-dist.cjs`
- 为了兼容旧 alias 而保留的桥接导出或桥接目录
- “某些包用 `imports`，某些包用 `tsconfig.paths`”的混合模型

## 11. 详细迁移目标

### 11.1 shared

#### package.json

- 删除所有 `imports`
- `exports` 只保留稳定公共入口
- `shared/ui` 的外部子入口按公共 UI API 面精简

#### 导入写法

- 包内代码统一改成：
  - `#shared-core/*`
  - `#shared-dom/*`
  - `#shared-react/*`
  - `#shared-ui/*`

#### 工具链

- 每包独立 `typecheck`
- 有测试则纳入 Vitest
- 构建统一迁到 tsdown

### 11.2 dataview

#### package.json

- 所有 dataview 包删除 `imports`
- `@dataview/react` 保持最小 `exports`
- `@dataview/core` 外部子入口按公共 API 面收敛，不再扩散

#### 导入写法

- 包内统一改成：
  - `#dataview-core/*`
  - `#dataview-engine/*`
  - `#dataview-meta/*`
  - `#dataview-react/*`
  - `#dataview-table/*`

#### 测试

- 所有 `.cjs` 测试迁到 Vitest
- 测试源码直接跑 TS 源码
- 删除测试预编译和路径重写脚本

#### 工作区结构

- `dataview/package.json` 的工作区脚本改成按包组织
- `dataview/tsconfig.json` 不再作为多包混编主入口

### 11.3 whiteboard

#### package.json

- `whiteboard-react` 删除当前 20+ 条显式 `imports`
- `whiteboard-engine` 删除当前 `imports`
- 其他 whiteboard 包如需包内 alias，一律放到包级 tsconfig，不写到 `package.json`

#### 导入写法

- 包内统一改成：
  - `#whiteboard-core/*`
  - `#whiteboard-engine/*`
  - `#whiteboard-editor/*`
  - `#whiteboard-react/*`
  - `#whiteboard-collab/*`

#### 测试

- 测试统一切到 Vitest
- bench / 本地脚本切到 `tsx`

#### 构建

- 白板各库包统一迁到 tsdown

## 12. 脚本与配置的最终统一方式

### 12.1 根目录

根目录负责：

- workspace orchestration
- 根级 `typecheck`
- 根级 `build`
- 根级 `test`

但不再负责：

- 定义 alias
- 兜底解析任何包内导入

### 12.2 app

app 只负责：

- Vite 配置
- app 自身 tsconfig
- 跟随消费包的正式公共 API

app 不再负责：

- 手写跨包 alias
- 直接吃包内部源码

### 12.3 包

每个包必须自带：

- `package.json`
- `tsconfig.json`
- `build`
- `typecheck`
- `test`（即使当前是 `No tests`，结构也应留作标准化入口）

## 13. 最终验证标准

只有同时满足下面所有条件，才算迁移完成：

### 13.1 结构

- 所有包目录与包边界清晰一致
- 没有旧目录桥接
- 没有旧实现残留

### 13.2 导入

- 跨包只用真实包名
- 包内只用包级 tsconfig alias
- 代码导入中不再保留跨目录相对路径主写法

### 13.3 package.json

- 所有包删除 `imports`
- `exports` 精简且稳定
- 没有镜像目录树式公共导出

### 13.4 工具链

- app / demo 全部走 `vite-tsconfig-paths`
- 测试全部走 Vitest
- 脚本 / bench 全部走 tsx
- 包构建全部走 tsdown

### 13.5 验证命令

最终正式验证应覆盖：

- 根 `typecheck`
- 根 `build`
- 根 `test`
- `shared` 单包验证
- `dataview` 单包与 workspace 验证
- `whiteboard` 单包与 workspace 验证
- app / demo 构建与类型检查

## 14. 最终实施顺序

这次迁移必须“一步到位”，但真正落地仍然要按一个严格顺序执行。

### 阶段 1：冻结正式规则

- 以本文件为唯一正式方案
- 宣告旧 `package.json#imports` 模型废弃
- 宣告根级 alias 废弃

### 阶段 2：统一工具链

- 安装并接入 `vite-tsconfig-paths`
- 引入 `Vitest`
- 引入 `tsx`
- 引入 `tsdown`

### 阶段 3：拆包级 tsconfig

- 给所有 shared/dataview/whiteboard 包补齐独立 tsconfig
- 包内建立全局唯一 alias 命名
- 拆掉 dataview 的多包混编主 tsconfig 依赖

### 阶段 4：批量改源码导入

- 所有包内相对导入改为包级 alias
- 所有跨包导入改为正式包名
- 删除任何旧 alias 与过渡桥接

### 阶段 5：清理 package.json

- 删除全部 `imports`
- 收敛全部 `exports`
- 同步构建、测试、脚本命令

### 阶段 6：删除旧工具链残留

- 删除 dataview 预编译测试链
- 删除 app 级手写 alias
- 删除根级旧 `paths`
- 删除所有兼容层

### 阶段 7：全仓验证

- 根级全量 typecheck
- 根级全量 build
- 根级全量 test

## 15. 本文件的执行优先级

后续如果有任何文档、脚本、代码注释、旧设计稿与本文件冲突，以本文件为准。

尤其是：

- [PATH_RESOLUTION_LONG_TERM_PLAN.zh-CN.md](/Users/realrong/Rostack/PATH_RESOLUTION_LONG_TERM_PLAN.zh-CN.md)

它在历史上用于收敛旧 alias 问题，但其“长期主机制应切到 `package.json#imports`”这一判断已经不再成立。

当前仓库唯一正式长期模型是：

- 跨包：真实 package 名
- 包内：包级 `tsconfig.paths`
- app：`vite-tsconfig-paths`
- test：`Vitest`
- script / bench：`tsx`
- build：`tsdown`
- `package.json`：只保留精简 `exports`

