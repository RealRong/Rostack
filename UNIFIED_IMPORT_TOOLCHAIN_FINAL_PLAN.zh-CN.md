# Unified Import Toolchain Final Plan

> 本文件是仓库当前唯一正式的长期导入与工具链方案。  
> 它取代旧的“`package.json#imports` 主导”方案，也取代上一版“`@...` 与 `#...` 双入口并存”的方案。  
> 后续 `shared`、`dataview`、`whiteboard`、`apps` 的所有源码导入、测试导入、bench 导入、构建导入统一以本文件为准。

## 1. 最终结论

这个仓库的最终统一方案只有一套：

- 源码导入唯一入口：`@...`
- 跨包导入：`@scope/pkg` 或 `@scope/pkg/...`
- 包内导入：仍然使用当前包自己的 `@scope/pkg/...`
- 根目录 `tsconfig.base.json` 作为唯一路径真相源
- App / demo：`vite-tsconfig-paths`
- 测试：`Vitest`
- Node 脚本 / bench / 本地执行：`tsx`
- 包构建：`tsdown`
- `package.json` 只保留精简 `exports`
- `package.json#imports` 不再使用
- `#...` 别名最终全部删除

如果只保留一句话，就是：

**全仓源码里只允许 `@...`，不再允许 `#...`。**

## 2. 为什么最终只保留 `@...`

之前的双入口模型看起来更“语义化”：

- `@...` 表示公共包入口
- `#...` 表示包内私有入口

但在当前仓库里，一旦把两者都放进根 [tsconfig.base.json](/Users/realrong/Rostack/tsconfig.base.json) 并对整个 monorepo 生效，实际效果就会变成：

- `@...` 和 `#...` 都变成全局可导入入口
- `#...` 不再真的代表“包内私有”
- 同一个模块存在两种合法写法
- review、搜索、codemod、lint 都必须处理双模型

这会直接带来三个长期问题：

### 2.1 边界语义失真

如果 `#whiteboard-engine/*`、`#shared-core/*` 在任何包里都能被解析，那么它们就已经不是“包内私有入口”，而只是另一套全局名字。

### 2.2 规范不再唯一

开发者会不断面临同一个问题：

- 这里写 `@whiteboard/engine/...`
- 还是写 `#whiteboard-engine/...`

只要同一模块有两种合法写法，代码库最终一定会混用。

### 2.3 集中维护退化成全局暴露

“根目录统一维护一份路径表”本身是对的。  
但“统一维护”不等于“把两套语义都全局开放”。

最终结论是：

- 保留根级单一真相源
- 但只保留一套名字
- 这套名字统一为 `@...`

## 3. 唯一允许的导入模型

最终源码里只允许一类主导入：

- `@shared/core`
- `@shared/core/store`
- `@shared/ui/menu/base`
- `@dataview/engine`
- `@dataview/engine/active/index/runtime`
- `@whiteboard/core/node`
- `@whiteboard/engine/read/store`
- `@whiteboard/react/features/node/components/NodeItem`

正式规则如下：

- 不允许 `#...`
- 不允许跨包相对路径
- 不允许包内深层相对路径作为主写法
- 不允许同时存在 `@...` 与 `#...` 两套合法入口

### 3.1 跨包导入

跨包统一使用真实 workspace package 名：

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

### 3.2 包内导入

包内也统一使用当前包自己的真实包名子路径：

- `@shared/core/...`
- `@shared/dom/...`
- `@shared/react/...`
- `@shared/ui/...`
- `@dataview/core/...`
- `@dataview/engine/...`
- `@dataview/meta/...`
- `@dataview/react/...`
- `@dataview/table/...`
- `@whiteboard/core/...`
- `@whiteboard/engine/...`
- `@whiteboard/editor/...`
- `@whiteboard/react/...`
- `@whiteboard/collab/...`

也就是说，包内与跨包使用同一套命名体系，只靠“当前 import 指向哪个 package 名”表达边界，不再引入第二套私有前缀。

## 4. 相对路径规则

最终正式规则：

- TypeScript / TSX / JS / JSX 代码导入里，不再允许跨目录相对路径作为主写法
- 包内代码统一使用 `@当前包名/...`
- 跨包代码统一使用 `@目标包名` 或 `@目标包名/...`

只保留少量例外：

- 紧邻同目录的资源文件，例如 `./style.css`、`./styles.css`、`./families.json`
- 极个别工具要求的相对资源路径

也就是说，最终状态下以下写法都应系统性退出源码主路径体系：

- `../../..`
- `../foo/bar`
- `./deep/module`
- `#shared-core/...`
- `#dataview-engine/...`
- `#whiteboard-react/...`

## 5. tsconfig 的最终职责

## 5.1 根级 tsconfig

根 [tsconfig.base.json](/Users/realrong/Rostack/tsconfig.base.json) 是全仓唯一正式路径表。

它负责：

- 公共编译选项
- 唯一的 `@...` 路径映射
- 所有 app / package / test / bench 的统一路径真相源

它最终应该保留：

- `@rostack/dataview-demo/*`
- `@shared/*`
- `@dataview/*`
- `@whiteboard/*`
- `@whiteboard/demo/*`

它最终不应再保留：

- `#shared-*`
- `#dataview-*`
- `#whiteboard-*`

### 5.2 包级 tsconfig

包级 `tsconfig.json` 继续存在，但职责简化为：

- 继承根 `tsconfig.base.json`
- 定义本包 `include`
- 定义本包编译输出与环境选项

包级 `tsconfig` 不再拥有第二套私有 alias 模型。  
也就是说，包级 `tsconfig` 不再定义 `#...`。

## 6. package.json 的最终职责

### 6.1 `exports`

`exports` 只负责对外公共 API。

长期原则：

- 默认只暴露 `.`
- 确实需要长期稳定子入口时，再增加少量子路径
- 不再镜像内部目录树

### 6.2 `imports`

正式结论：

- 所有包里的 `imports` 最终应删除
- 不再允许 `package.json#imports` 参与源码路径体系
- 不再保留任何兼容 `imports` 的双轨方案

## 7. 工具链的最终统一方式

### 7.1 App / demo

- `Vite`
- `vite-tsconfig-paths`

正式规则：

- 所有 app / demo 都跟随根 `tsconfig.base.json`
- 不再手写第二套 `resolve.alias`

### 7.2 测试

- `Vitest`

正式规则：

- 所有测试都通过 `vite-tsconfig-paths` 跟随根 `tsconfig.base.json`
- 测试里也只允许 `@...`
- 不再允许 `#...`
- 不再使用 `node --test`
- 包级测试如果引用 bench / fixture，也继续走根级 `@...` 子路径，不再回退到相对路径

### 7.3 Node 脚本 / bench / 本地执行

- `tsx`

正式规则：

- bench、一次性脚本、本地调试脚本统一走 `tsx`
- 脚本里也只允许 `@...`
- 不再保留为 `#...` 或旧测试链路存在的中间转换脚本
- bench 辅助模块统一挂在对应包名下的 `@scope/pkg/bench/*` 子路径

### 7.4 App / demo 源码导入

正式规则：

- app / demo 的源码模块也统一走 `@...`
- app 内部源码使用自身 package 名子路径，例如 `@whiteboard/demo/*`
- 不再把 app 内部 TypeScript 模块写成 `./App`、`./scenarios` 这类相对导入

### 7.5 包构建

- `tsdown`

正式规则：

- 所有库包构建统一走 `tsdown`
- 构建时也只跟随同一套 `@...` 路径表

## 8. 当前仓库收口状态

本方案已经按终态要求收口完成。

当前状态：

- 全仓源码导入统一为 `@...`
- 根 [tsconfig.base.json](/Users/realrong/Rostack/tsconfig.base.json) 只保留 `@...`
- 所有包保持无 `imports`
- app / test / bench 入口也已切到 `@...`
- `shared/ui` README 已与新模型对齐
- 旧迁移脚本已删除
- dataview 的旧测试中间产物目录已删除

仍需长期保持的约束只有一类：

- 后续新增代码、测试、bench、脚本、文档都不得重新引入 `#...`

## 9. 不再允许重新引入的旧模型

以下几类事情已经正式退出，不得重新引入：

- 大量 `package.json#imports`
- `tsup`
- `node --test`
- dataview 的 `prepare-test-dist.cjs`
- `.tmp/group-test-dist`

也就是说，后续不再存在“继续迁 `#...`”这一步，因为仓库已经正式收敛成 `@...` 单入口模型。

## 10. 最终验证标准

只有同时满足下面所有条件，才算迁移完成：

### 10.1 路径模型

- 全仓源码只出现 `@...`
- 不再出现任何 `#...`
- 不再出现第二套私有 alias

### 10.2 根配置

- 根 [tsconfig.base.json](/Users/realrong/Rostack/tsconfig.base.json) 只保留 `@...`
- 不再保留任何 `#...`

### 10.3 package.json

- 所有包删除 `imports`
- `exports` 精简且稳定

### 10.4 工具链

- app / demo 走 `vite-tsconfig-paths`
- 测试走 `Vitest`
- 脚本 / bench 走 `tsx`
- 构建走 `tsdown`

### 10.5 源码风格

- 跨包统一 `@目标包名`
- 包内统一 `@当前包名/...`
- 相对路径不再作为主写法

## 11. 最终实施顺序

### 阶段 1：冻结正式规则

- 以本文件为唯一正式方案
- 宣告 `#...` 终态废弃
- 宣告 `@...` 为唯一源码导入入口

### 阶段 2：收缩根路径表

- 从根 [tsconfig.base.json](/Users/realrong/Rostack/tsconfig.base.json) 删除全部 `#...`
- 只保留 `@...`

### 阶段 3：批量改源码

- `shared/**` 内部 `#...` 全部改为 `@shared/...`
- `dataview/**` 内部 `#...` 全部改为 `@dataview/...`
- `whiteboard/**` 内部 `#...` 全部改为 `@whiteboard/...`

### 阶段 4：批量改测试 / bench / 脚本

- 所有 `test/**`
- 所有 `bench/**`
- 所有运行时辅助入口
- 所有 app / demo 内部源码入口

统一把 `#...` 改为 `@...`

### 阶段 5：清理残留

- 删除旧 `#...` 文档说明
- 删除旧迁移脚本
- 删除任何为双入口保留的兼容配置

### 阶段 6：全仓验证

- 根 `typecheck`
- 根 `build`
- 根 `test`

## 12. 本文件的执行优先级

后续如果任何代码、文档、注释、旧设计稿与本文件冲突，以本文件为准。

当前仓库唯一正式长期模型是：

- 根目录单一路径表
- 只保留 `@...`
- 跨包与包内统一使用 `@...`
- App：`vite-tsconfig-paths`
- Test：`Vitest`
- Script / bench：`tsx`
- Build：`tsdown`
- `package.json`：只保留精简 `exports`
