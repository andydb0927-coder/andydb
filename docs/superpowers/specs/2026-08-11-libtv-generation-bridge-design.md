# 无线画布第 3A 阶段：受控 LibTV 真实生成桥接设计规格

日期：2026-08-11
状态：已批准，依据用户“继续”与“后续流程不再询问”的站立授权执行
范围：建立真实可运行的 LibTV CLI 提供方，但本阶段的开发与验收不执行付费生成、不新建远程画布、不上传用户素材。

## 1. 背景与已验证事实

第 2A 阶段已将 `CanvasPage` 与 `DemoGenerationAdapter` 解耦，并保留生成队列、任务恢复、版本、素材入库与失败重试。当前生产路由仍使用 `DemoGenerationAdapter`。

本机已安装官方 `libtv` CLI 1.1.1。通过只读命令已验证：

- `libtv account info` 可连通并返回已登录用户与活跃账户；
- `libtv model search --type image` 与 `--type video` 可返回当前模型目录；
- `libtv project list` 可返回当前账户可访问画布；
- 未执行 `project create`、`upload`、`node create --run` 或其它远程写入。

这些证据只证明 CLI 登录与只读目录可用，不证明实际出图或出片质量。

## 2. 目标与非目标

### 2.1 目标

1. 通过官方 `libtv` CLI 读取账户状态、画布与模型目录。
2. 让用户在“模型能力”页选择 Demo 或 LibTV，并为 LibTV 选择远程画布、图片模型和视频模型。
3. 将生成请求通过同源本地桥接交给 CLI，凭据永远不进入浏览器、IndexedDB、localStorage 或日志。
4. 每次远程生成前显示可访问确认对话框，明确远程画布、模型、操作和“可能消耗额度”。
5. 将 CLI 终态结果转换为现有 `GenerationResult`，继续使用已验证的任务、版本、素材库和持久化流程。
6. 对缺少 CLI、未登录、桥接关闭、选择不完整、参考素材不支持、CLI 失败和结果不合法提供精确错误。

### 2.2 非目标

- 不直接调用 LibTV HTTP API，不从网页提取 token。
- 不将 CLI 凭据或账户详情暴露给前端。
- 不自动新建或删除远程画布。
- 不在自动化验收中触发付费生成。
- 不声称真实生成质量已验证；这需要用户在产品内确认后单独运行低成本写入验收。
- 不实现会员、积分充值、价格计算、远程任务操作台或跨设备同步。

## 3. 方案比较

### 3.1 浏览器直连 LibTV（拒绝）

优点是代码路径短。缺点是需在前端持有凭据，并且需自行猜测私有 HTTP 合同，违反 LibTV CLI 使用约束与凭据隔离要求。

### 3.2 自定义通用远程生成 API（拒绝）

可以快速交付一个 `fetch` 适配器，但没有真实服务、账户、模型目录和任务语义时仍是占位接口，不满足“只实现有真实信息架构与可验证交互”。

### 3.3 同源本地 CLI 桥接（选定）

Vite dev/preview 服务以插件方式提供最小同源路由，后端用 `spawn(libtv, args, { shell: false })` 执行官方 CLI。浏览器只看到经过缩减的画布/模型目录与生成结果。这一方案对齐官方画布语义、隔离凭据，又能在无付费调用的情况下用可注入 CLI runner 和真实浏览器完成验收。

## 4. 架构与边界

```text
模型能力页
  ├─ GET /api/libtv/catalog ─────────┐
  └─ localStorage 提供方选择          │
                                        ▼
画布操作 → 额度确认对话框 → RuntimeGenerationAdapter
                                        │
                                        └─ POST /api/libtv/generate
                                                   │
                                                   ▼
                                        Vite LibTV bridge plugin
                                                   │
                                      spawn("libtv", args, shell=false)
                                                   │
                                                   ▼
                                           LibTV 远程画布
```

### 4.1 服务端模块

`app/server/libtv/` 包含五个独立单元：

- `cli-runner.ts`：运行二进制，分离 stdout/stderr，限制输出大小，不使用 shell。
- `catalog.ts`：调用 `account info`、`project list`、`model search`，只返回登录布尔值、画布 `uuid/name`、模型 `modelKey/modelName/description/estimatedTime/pricingRule/vip`。
- `generation-command.ts`：验证请求，准备参考素材，产生 CLI args 数组并解析终态 JSON。
- `http-handler.ts`：实现 `GET /api/libtv/catalog` 和 `POST /api/libtv/generate`，限制方法、Content-Type、body 尺寸和错误响应。
- `vite-plugin.ts`：将同一 handler 接入 dev 与 preview server。

`tsconfig.node.json` 覆盖这些文件，它们不进入浏览器 bundle。

### 4.2 客户端模块

`app/src/features/generation/` 新增：

- `generation-provider-preference.ts`：保存 `demo | libtv` 及远程画布、图片模型、视频模型；严格解析 localStorage，无效值回退 Demo。
- `libtv-generation-adapter.ts`：把当前选择与 `GenerationRequest` 发往同源桥接，解析精确错误，将有效响应转为 `GenerationResult`。
- `runtime-generation-adapter.ts`：在每次 `start()` 时读当前选择；Demo 走原适配器，LibTV 走真实适配器，绝不静默回退。
- `GenerationConfirmationDialog.tsx`：只在 LibTV 模式下显示，确认后才 enqueue/retry。

`GenerationRequest` 新增结果种类与结构化参考素材：

```ts
interface GenerationReference {
  url: string
  kind: 'image' | 'video' | 'audio'
  mimeType: string
}

interface GenerationRequest {
  projectId: string
  nodeId: string
  operation: GenerationOperation
  targetKind: 'image' | 'video'
  prompt: string
  referenceAssets: GenerationReference[]
}
```

Demo 适配器仍使用第一个参考素材作为可确定预览。所有排队、取消、版本引用完整性与原子应用规则保持不变。

## 5. 只读目录与提供方选择

`GET /api/libtv/catalog` 返回：

```ts
interface LibTvCatalog {
  cliInstalled: boolean
  cliVersion?: string
  authenticated: boolean
  writesEnabled: boolean
  projects: Array<{ uuid: string; name: string }>
  imageModels: LibTvModelSummary[]
  videoModels: LibTvModelSummary[]
  error?: string
}
```

模型页提供真实状态与交互：

1. 展示 CLI 版本、登录状态、写入门禁与目录错误。
2. 显示 Demo 与 LibTV 两个提供方，不把未连接状态宣称为可用。
3. 选择 LibTV 时必须同时选定远程画布、图片模型和视频模型。
4. 只在 `authenticated && writesEnabled` 且选择完整时允许启用 LibTV。
5. `writesEnabled` 仅由服务端环境变量 `WIRELESS_CANVAS_ENABLE_LIBTV_WRITES=1` 开启；前端不能绕过。
6. 当目录不可用时，Demo 仍可用，已保存的 LibTV 选择不得自动触发任何请求。

## 6. 写入门禁与额度确认

远程写入需要三层同时成立：

1. **运行时门禁**：启动 Vite 时显式设置 `WIRELESS_CANVAS_ENABLE_LIBTV_WRITES=1`。
2. **提供方门禁**：用户在模型页主动选择 LibTV 与完整远程目标。
3. **单次门禁**：每次生成或重试都必须在画布确认对话框点击“确认并开始 LibTV 生成”。

对话框展示操作类型、远程画布名称、模型名称、参考素材数量，以及“会创建远程节点/可能上传参考素材/可能消耗额度”。缺少可靠计价信息时必须显示“费用以 LibTV 提交时为准”，不猜测价格。

Demo 模式不显示该对话框，保持现有交互速度。

## 7. 参考素材与 CLI 命令

客户端在发送 LibTV 请求前将相对或同源素材 URL 读取为 Data URL。桥接仅接受经验证的 `data:image/*`、`data:video/*`、`data:audio/*`，单个最大 20 MiB，最多 3 个。远程跨域 URL 若无法由浏览器以 CORS 读取则精确拒绝，桥接不代为抓取，避免 SSRF。

每个参考素材写入临时目录，通过：

```text
libtv upload <reference-name> -p <project-uuid> -f <temp-file> -t <kind>
```

创建主节点并同步等待 CLI 终态：

```text
libtv node --x <x> --y <y> create <generated-name>
  -p <project-uuid>
  -t <image|video>
  --prompt <prompt>
  -s model=<model-name>
  [--left <reference-name> ...]
  [-s modeType=<text2video|singleImage2video|video2video>]
  --run
```

视频首版只支持：无参考的 `text2video`、单图的 `singleImage2video`、单视频的 `video2video`。其它多参考/混合模式在 CLI 调用前拒绝，不猜测模型 schema。图片节点支持无参考和最多三个图片参考，具体条数仍由 CLI 模型 schema 做权威校验。

临时文件在 CLI 结束后清理。CLI `--run` 本身负责提交与轮询，桥接不叠加超时或自定义轮询。浏览器取消只表示不再应用结果；UI 不宣称已撤销 LibTV 远程任务。

## 8. 结果解析与本地入库

桥接只接受有效 JSON，并从 `data.url` 数组提取第一个 `http(s)` 产物 URL。图片产物映射为 `image`，视频产物映射为 `video`；可用的 `poster`、尺寸和时长作为可选元数据。缺少 URL、种类错误或非 JSON 输出必须失败，不伪造 Demo 结果。

LibTV 适配器创建本地 `asset.id`与 `version.id`，保留原 prompt 和远程 URL。后续交给现有 `GenerationQueue` 原子应用，`ProjectRepository.save()` 再将成功素材同步到本地素材库，来源为 `generated`。

## 9. 错误、恢复与取消

- 目录读取失败：模型页显示警报与重试；Demo 仍可用。
- 写入门禁关闭：LibTV 选择控件禁用，服务端 POST 仍独立返回 403。
- 未完成选择：不打开生成确认框，提供到模型页的可操作错误。
- 参考素材失败：任何运程 URL 、超大、MIME 或数量错误在首次远程写入前拒绝。
- CLI 非零退出：保留去敏后的 stderr 摘要作为任务错误，不返回命令行、环境变量或凭据。
- 本地取消：`AbortError` 使本地任务进入 cancelled；文案明确远程任务可能继续。
- 重试：每次重试重新显示额度确认，沿用原 job id 与递增 attempt。

## 10. 安全约束

1. 桥接只作为 Vite 同源路由，不单独监听公共端口，不设置宽松 CORS。
2. 所有 CLI 命令使用 args 数组与 `shell: false`，不接受前端提供的任意子命令或 flag。
3. 画布 UUID、模型名、prompt、MIME、Data URL 大小和数量都在第一次写入前验证。
4. 仅允许选择当次目录返回的画布 UUID 和模型 `modelName`；服务端在 POST 中重新校验。
5. 不记录完整 prompt、Data URL、CLI stdout/stderr、用户账户信息或任何 token。
6. 临时目录使用操作系统随机路径并在 `finally` 清理。

## 11. 可访问性与交互

- 目录读取状态使用 `role="status"`，错误使用 `role="alert"`。
- 画布、图片模型和视频模型都使用有可见 label 的原生 `select`。
- 提供方选择使用单选组，禁用原因以文字显示。
- 额度确认对话框有可见标题、描述、默认取消焦点、Escape 关闭和可靠焦点返回。
- 开始生成后沿用现有任务状态与读屏反馈。
- 取消远程等待时显示“已停止在本地等待，LibTV 任务可能仍在运行”。

## 12. 测试与验收

### 12.1 服务端 focused tests

- CLI runner 始终 `shell: false`，分离 stdout/stderr，非零退出去敏。
- 目录解析只返回允许字段，不返回用户或 token。
- 写入门禁关闭时 POST 在 runner 调用前 403。
- 画布/模型不在目录、prompt 空值、引用超大/过多/远程 URL 在首次写入前失败。
- Data URL 被临时文件 + `libtv upload` 正确转换，临时目录成功和失败都清理。
- image/video 命令 args 精确匹配官方 CLI，不经 shell 拼接。
- 结果缺 URL、种类错误或非 JSON 时拒绝。

### 12.2 客户端 focused tests

- 偏好解析对损坏 localStorage 回退 Demo。
- LibTV 适配器不静默回退，网络/桥接/结果错误保留可操作文案。
- 模型页覆盖加载、成功、失败、选择不完整、门禁关闭与成功启用。
- Demo 操作不弹确认框；LibTV 新生成和重试都弹框，取消不 enqueue，确认仅 enqueue 一次。
- 现有队列取消、恢复、版本引用、生成后聚焦、持久化流程不变。

### 12.3 真实浏览器

Playwright 使用路由拦截的只读目录与伪 CLI 终态，不使用远程额度，覆盖：

1. 进入模型页，看到已登录 CLI、选择画布与图片/视频模型。
2. 启用 LibTV，回到画布点击生成，看到额度确认对话框。
3. 取消一次证明没有 POST；再确认一次证明只有一次 POST。
4. 伪终态图片进入真实节点版本、本地素材库和项目持久化。
5. 控制台/page errors 为空，键盘关闭与焦点返回可用。

### 12.4 全量门禁

- focused Vitest；
- 全量 Vitest；
- `npm run typecheck`；
- `npm run build`；
- 全量 Playwright；
- `git diff --check`；
- 独立代码审查；
- tracked 工作树干净。

## 13. 交付边界

本阶段完成后可以宣称：

- 应用已具有真实 LibTV CLI 连接、当前画布/模型目录、明确额度门禁与可运行生成命令路径；
- 凭据隔离、失败恢复、版本与素材入库已自动化验证；
- 验收期间未执行付费写入。

不可以宣称：

- LibTV 实际出图/出片质量、计价、耗时或远程取消已验证。

后续首次远程写入验收应使用独立测试画布，先生成一张低成本角色卡或场景图，核对额度、产物 URL、本地入库和远程节点后，再验证视频。

## 14. 受保护内容

`audit-2026-08-06/` 不得读取、改动、删除、暂存或提交。所有 Git 状态检查使用 `--untracked-files=no`。
