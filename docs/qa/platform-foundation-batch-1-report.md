# 第二阶段批次1：代码结构整理与平台底座

## 起点与范围

- 分支：`codex/platform-shell-phase`。
- 起始提交：`1485650d0421d3d8f35b3e77fbc647f462c7986b`。已执行 checkout 与 `git pull --ff-only origin codex/platform-shell-phase`，结果为最新。
- 起始工作树干净。交接基线为147个测试文件、1295项Vitest、95项Playwright。
- 本批只整理任务状态、错误边界、素材仓储职责，并补保存恢复测试。没有修改模型目录、生成请求体、计费算法、数据库schema或已有持久化字段。

## 1. 统一任务状态

`app/src/features/generation/task-status.ts` 是唯一 `TaskStatus` 定义；`JobStatus` 保留兼容别名。生成任务与导出任务共用 queued/running/succeeded/failed/cancelled。

活动态、终态、可重试态与转移表集中维护。队列取消/重试、项目生成基线清理复用共享判断，不增加新的运行时状态拦截，不改 attempt/sequence、重复结果防护或撤销语义。

| 来源 | 边界处理 | 保持的行为 |
|---|---|---|
| Seedance `pending` | 映射 queued | 继续轮询，进度仍为55 |
| Seedance `expired` | 映射 failed，保留超时原因 | 抛出原中文超时提示，不回填结果 |
| Seedance远端 `cancelled` | Provider拒绝，队列记录failed | 与用户主动取消区分，保留重试语义 |
| 用户主动取消 | cancelled | AbortError身份与旧结果丢弃不变 |
| 未知远端状态 | 拒绝解析 | 不默认为成功或继续无限轮询 |
| 图片/文本/音频同步Provider | 无额外任务枚举 | 由队列管理五态，不虚构轮询状态 |

## 2. 统一安全错误

`generation-errors.ts` 集中HTTP错误码、Seedream安全审核错误码、LibTV桥接业务错误码、中文提示以及工具委托错误映射。

- 五个基础Provider统一网络异常与HTTP错误处理；JSON解析统一安全提示。
- 原有401/403/429等文案、超时提示、部分图片成功保存和实际扣费逻辑保持。
- 新增错误边界修复：网络异常、Seedance远端失败详情和队列历史不再直接回显可能含凭据的原文。
- 原始异常保留在不可枚举的 `cause`，不写入项目/历史或展示到UI；未知错误不伪装成成功。
- AbortError继续传递；上游详情保留原160字上限，本地恢复说明不截断。
- 图片编辑、视频续写、拉片分析、主体提取、图片分析不再重复定义错误转换规则。

TDD首先复现7个行为失败：5条基础Provider网络异常透传、1条远端失败详情透传、1条队列持久化原始错误。修复后全部转绿。保留[初始契约红测试](evidence/platform-foundation-batch-1/red-contracts.log)与[7项行为失败记录](evidence/platform-foundation-batch-1/red-provider-boundaries.log)。

## 3. 素材仓储按域整理

| 层 | 文件 | 职责 |
|---|---|---|
| 兼容入口 | `assets/asset-library-repository.ts` | 保留原class/type导出，UI无需迁移路径 |
| 域规则 | `assets/domain/asset-library-policy.ts` | 名称校验、记录存在性、引用影响清单、删除结果契约 |
| IndexedDB实现 | `assets/infrastructure/indexeddb-asset-library-repository.ts` | 查询、持久化、事务、文件指纹去重 |
| 既有模型 | `assets/library-model.ts` | 原数据结构与转换保持，仅复用统一引用判断 |

保留原引用检查范围、项目排序/节点标题去重、所有返回值、唯一指纹索引、错误传播、重命名/移动语义。没有数据库迁移。

新增事务证据：确认删除时若资产写入失败，项目的引用清理也回滚；非重复文件写入失败必须抛出原错误，不误报导入成功。

## 4. 项目保存与恢复审查

| 路径 | 原机制 | 本轮验证 |
|---|---|---|
| `persistActive`重叠写 | 串行Promise链，写入顺序不反转 | 旧写入失败后已排队新快照仍可成功 |
| 保存完成回调 | 请求序号 + 活动项目对象身份 | 原有测试覆盖旧回调不能把新编辑标记为已保存 |
| 保存失败 | saveStatus=error，保留编辑，允许重试 | 原契约保留；调度链catch只为继续排队，原write仍单独await并反馈失败 |
| `hydrate`并发/取消 | 最新请求与AbortSignal检查 | 取消加载不激活返回项目、不丢草稿 |
| `hydrate`读取失败 | Promise拒绝，当前状态不变 | 原错误抛给调用者，草稿/撤销栈保留，后续可重试 |
| 重复保存恢复 | 项目put、素材仅补缺、旧快照规范化 | 3轮循环后多画布/节点/版本/任务/素材数量和自定义素材元信息一致 |
| 项目与素材索引写入 | 同一Dexie事务 | 项目写入失败时素材索引回滚，重试后二者一致 |

结论：这些路径的既有算法通过审计，无需重写。只补测试和一处调度链注释；状态判断改用共享契约。

## 5. 门禁记录

按规定顺序运行，未删除或放宽既有断言。

| 门禁 | 实测结果 | 日志 |
|---|---|---|
| `npm run typecheck` | 通过，退出码0 | [typecheck](evidence/platform-foundation-batch-1/typecheck.log) |
| `npm run test:run` | 152文件，1351/1351通过，退出码0 | [Vitest](evidence/platform-foundation-batch-1/vitest.log) |
| `npm run build:mock` | 通过，退出码0；显式mock、Seedream Key置空，含404回退页 | [build:mock](evidence/platform-foundation-batch-1/build-mock.log) |
| `PLAYWRIGHT_OFFLINE_DIST=dist PLAYWRIGHT_PORT=4187 npx playwright test --workers=2` | 95/95通过，5.3分钟，退出码0；无重试或断言放宽 | [Playwright](evidence/platform-foundation-batch-1/playwright.log) |

新增56项Vitest：状态4、集中错误26、Provider边界10、队列1、素材域8、仓储事务2、保存恢复5。原1295项全部保留。

原95项E2E全部保留且未修改；包括[273个路由/视口组合](evidence/platform-foundation-batch-1/route-matrix.json)与[节点面板控制台记录](evidence/platform-foundation-batch-1/canvas-console.json)，记录中的页面错误与控制台错误均为空。fixture通过不等于真实供应商验收。

已知非阻断日志：测试环境对localhost:3000的辅助连接报EPERM（稳定化阶段已有同类记录）；Vite仍有大于500kB的chunk提示。不调整阈值、不关闭检查掩盖告警。

## 6. 安全、证据与回滚

- 浏览器使用全新Playwright上下文与独立4187端口；真实接口由fixture拦截，未操作用户浏览器或清用户IndexedDB。
- 不读取本机 `.env.local`，不添加依赖，不运行真实生成。公开模型目录测试读取mock dist；生成链路测试继续使用假Key开发服务，两者不混淆。
- [安全扫描摘要](evidence/platform-foundation-batch-1/security-check.json)：扫描602个跟踪/待提交文本与mock产物，没有高置信凭据格式命中，mock产物没有非空凭据字段。模式扫描不等同于完整密钥泄漏审计。
- 本批日志单独归档，不覆盖前一阶段的最终验收记录；自动化重写的旧截图已从开工备份精确恢复，原证据目录没有差异。原始终端日志保留控制字符与空行，代码/人工文档另行执行diff空白检查。
- 决策：保持兼容别名/入口；不强制新增状态转移校验；不更改保存失败的既有UI契约；不改变素材引用边界或数据库结构。
- 回滚：revert本批提交即可；不需要清库、数据迁移或用户重新建项目。
