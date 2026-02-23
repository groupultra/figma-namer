# Phase 0: 基础设施搭建报告

## 思路
Figma Plugin 的双线程架构（Main Thread sandbox + UI Iframe）决定了项目需要两套独立的构建目标：
- `code.js`: Plugin sandbox 入口，编译自 TypeScript，不能使用 DOM API
- `ui.html`: React UI 入口，需要将 JS/CSS 内联到 HTML（Figma 要求单文件 UI）

选用 Webpack 多 entry 配置同时构建两个目标。

## 过程
1. 创建目录结构：`src/plugin/`, `src/ui/`, `src/vlm/`, `src/shared/`, `backend/`, `tests/`, `docs/`
2. 编写 `manifest.json` - Figma Plugin 清单，声明 network access 和 document access
3. 编写 `package.json` - 依赖: React 18, TypeScript 5, Webpack 5, Vitest, Figma Plugin Typings
4. 编写 `tsconfig.json` - 路径别名 (@shared, @plugin, @ui, @vlm)
5. 编写 `webpack.config.js` - 双 entry: plugin(code.ts) + ui(index.tsx), HTML 内联插件
6. 编写共享类型 (`src/shared/types.ts`):
   - `NodeMetadata` - 节点元数据
   - `SoMLabel` - SoM 标记
   - `NamingBatch` - VLM 批处理
   - `NamingResult` - 命名结果
   - `NamingSession` - 会话状态
   - `NamerConfig` - 配置
7. 编写消息协议 (`src/shared/messages.ts`): PluginToUIMessage / UIToPluginMessage
8. 编写常量 (`src/shared/constants.ts`): SoM 渲染参数、防重叠算法参数、批处理限制
9. 编写 Base64 工具 (`src/utils/base64.ts`)
10. 编写 Figma API Mock (`tests/mocks/figma-api.ts`): MockNode 类 + 模拟登录页面
11. 编写 Vitest 配置和测试 setup
12. 编写 Backend 配置: Vercel Edge Functions + CORS

## 结果
- 完整的项目骨架已就绪
- 共享类型系统覆盖了全部数据流
- 消息协议定义了 Main Thread ↔ UI 的完整通信
- 构建系统可生成 Figma 可加载的 code.js + ui.html
- Git 仓库已初始化并提交

## 关键决策
| 决策 | 选择 | 理由 |
|------|------|------|
| 构建工具 | Webpack 5 | Figma Plugin 需要内联 HTML, Webpack 的 InlineChunkHtmlPlugin 原生支持 |
| 测试框架 | Vitest | 原生 TypeScript 支持，与 Vite 生态兼容，比 Jest 更快 |
| 后端部署 | Vercel Edge Functions | 零配置部署、自动 HTTPS、全球 CDN |
| UI 框架 | React 18 | Figma 官方推荐，生态成熟 |
