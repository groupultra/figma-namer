# Module E: Serverless 后端 API 代理 报告

## 思路
Figma 插件 UI 不能直接暴露 VLM API Key（前端代码可被用户查看）。
需要一个轻量级后端代理：
- 安全存储 API Key（Vercel 环境变量）
- 代理 Claude/OpenAI API 请求
- 处理 CORS（Figma iframe 跨域）

## 模块结构
```
backend/
├── api/
│   └── naming.ts              # POST /api/naming 端点
├── src/vlm/
│   ├── claude-client.ts       # Claude API 客户端
│   ├── openai-client.ts       # OpenAI API 客户端
│   └── prompt-builder.ts      # 服务端 Prompt 构建
├── package.json
├── tsconfig.json
└── vercel.json                # Vercel 部署配置
```

## 安全设计
- API Key 仅存在 Vercel 环境变量中
- 请求验证：检查必要字段、payload 大小限制
- CORS 白名单：仅允许 Figma 插件域名
- 无状态：每次请求独立，不存储任何用户数据

## 过程

### 1. Vercel Serverless 入口 (`api/naming.ts`)

**CORS 处理** — `setCorsHeaders()` 维护白名单 `ALLOWED_ORIGINS`（`https://www.figma.com`、`https://figma.com`、`"null"`），同时允许 `*.figma.com` 子域名。开发环境（`NODE_ENV !== 'production'`）允许所有来源。生产环境中未命中白名单的请求不设置 `Access-Control-Allow-Origin` 头，浏览器将自动拦截。OPTIONS 预检请求返回 204。

**请求验证** — `validateRequestBody()` 进行全面检查：
- `action` 必须为 `"generate_names"`
- `imageBase64` 非空字符串，≤ 25MB（约 33M Base64 字符），通过正则验证 Base64 格式（支持可选的 data URI 前缀）
- `nodeTextSupplements` 必须为数组，≤ 50 项。每项验证 markId（number）、textContent（string | null）、boundVariables（array）、componentProperties（object）
- `globalContext` 为字符串，≤ 2000 字符
- `platform` 必须为 `'iOS' | 'Android' | 'Web' | 'Auto' | ''` 之一
- `vlmProvider` 必须为 `'claude' | 'openai'`

验证失败抛出 `ValidationError`，由主处理函数捕获后返回 400。

**速率限制** — 基于内存的 IP 级限流：每 IP 每分钟最多 30 次请求（WINDOW_MS = 60000, MAX_REQUESTS = 30）。`rateLimitMap` 存储 `{count, resetAt}`，定时器每 5 分钟清理过期条目。超限返回 429。

**主处理流程**:
1. 验证请求体
2. 调用 `buildSystemPrompt()` + `buildUserPrompt()` 构建提示词
3. 根据 `vlmProvider` 选择调用 `callClaude()` 或 `callOpenAI()`
4. `extractJson()` 从 VLM 原始输出提取 JSON（支持直接解析、Markdown 围栏、花括号定位三种策略）
5. `validateNamings()` 验证 namings 数组结构
6. 返回 `{success: true, data: {namings, model, usage}}`

**错误响应分类** — 捕获异常后根据错误信息特征返回不同 HTTP 状态码：认证错误 → 502，VLM 限流 → 429，超时 → 504，其余 → 500。

### 2. Claude 客户端 (`src/vlm/claude-client.ts`)

使用 `@anthropic-ai/sdk` 官方 SDK，单例 `Anthropic` 客户端实例（跨请求复用连接池）。API Key 从 `process.env.ANTHROPIC_API_KEY` 读取。

`callClaude()` 调用 Messages API：
- 模型: `claude-sonnet-4-6`
- temperature: `0.1`（低温保证命名一致性）
- max_tokens: `4096`
- 消息结构: system prompt + user message（image content block + text content block）
- 图片传入方式: Base64，自动检测 media_type（png/jpeg/webp/gif）

### 3. OpenAI 客户端 (`src/vlm/openai-client.ts`)

使用 `openai` 官方 SDK，同样单例客户端。API Key 从 `process.env.OPENAI_API_KEY` 读取。

`callOpenAI()` 调用 Chat Completions API：
- 模型: `gpt-4o`
- temperature: `0.1`
- max_tokens: `4096`
- 图片传入方式: data URI（`image_url` content part，`detail: 'high'`）
- 无 Base64 前缀时自动添加 `data:image/png;base64,`

### 4. 服务端 Prompt 构建 (`src/vlm/prompt-builder.ts`)

`buildSystemPrompt()` 构建基于 CESPC 框架的 XML 结构化提示：
- `<naming-framework>` — 定义 5 个 segment（Context/Element/State/Property/Category），含格式规则和 10 个示例
- 平台特定指南 — iOS（Apple HIG 术语）、Android（Material Design 术语）、Web（语义 HTML 术语）
- 10 条编号规则（视觉分析优先、补充数据辅助、CESPC 格式、小写连字符、2-4 段限制等）
- `<output-format>` — 严格约束 JSON 输出格式（`{namings: [{markId, name, confidence}]}`）

`buildUserPrompt()` 将每个节点的补充信息编码为 XML（`<mark id="N">` + text/bound-variables/component-properties 子标签），XML 特殊字符正确转义。

## 结果

模块 100% 完成。共 53 个集成测试覆盖了 CORS 处理（白名单/子域名/开发模式）、OPTIONS 预检、请求验证（各字段边界值、Base64 格式、数组长度限制、平台白名单）、速率限制触发与重置、Claude/OpenAI 成功调用流程、JSON 提取多策略、错误分类与响应码映射（400/429/502/504/500）全部通过。
