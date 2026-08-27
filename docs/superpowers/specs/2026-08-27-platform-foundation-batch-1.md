# 第二阶段批次1：代码结构整理与平台底座

起点：主分支 `codex/platform-shell-phase`，`1485650`；已执行从 origin 快进拉取，结果为最新。基线为147个文件、1295项单测、95项E2E。本批不新增真实调用、不读取本机密钥，不改数据库表、字段、版本、模型目录或请求体。

## 1. 任务状态契约

- 唯一内部 `TaskStatus`：queued / running / succeeded / failed / cancelled。保留 `JobStatus` 类型别名兼容旧导入，生成与导出记录共用契约。
- 提取活动态、终态、可重试态和合法转移的纯函数，队列与项目保存层读取同一份策略。
- Seedance 原始 `pending` 映射 queued，`expired` 映射 failed；超时说明仍保留。未知状态仍拒绝，不默认为成功。
- 供应商远程 cancelled 仍作为失败回传队列；用户主动取消仍是 cancelled。不得把两者合并而改变重试/扣费/结果回填行为。其他同步图片、文本、音频Provider无单独异步任务枚举，不增加虚构状态。

## 2. 错误处理

- 集中HTTP状态与供应商业务错误码映射，保持各入口既有中文文案。
- 提取网络错误、JSON解析和工具委托错误的安全转换；HTTP错误不回显响应正文，保留不可枚举的 cause 供调试，UI/历史只接收安全message。
- AbortError继续传递；取消、超时、部分图片成功的分支和费用不变。不吞异常，不用成功结果替代失败。
- 队列只持久化安全错误文案；工具层不再各自复制鉴权/限流正则及文案转换。

## 3. 素材仓储按职责归位

- `assets/domain/`：素材引用影响、重命名/移动纯策略、删除结果契约。
- `assets/infrastructure/`：IndexedDB仓储，保留现有事务、唯一指纹去重、导入与删除返回值。
- 旧 `assets/asset-library-repository.ts` 保留兼容导出；调用方无需批量改路径。`library-model`的引用判断使用同一域策略。
- 不迁移任何数据，不更改libraryAssets索引或项目快照格式。

## 4. 保存恢复审查

审查 `persistActive` 串行写链、请求序号与对象身份检查，以及 `hydrate` 最新请求/AbortSignal保护。补测重复保存恢复、写失败后排队继续、加载失败保留旧项目且可重试、取消加载不激活、旧失败不能污染后激活项目。已有saveStatus错误反馈保持原契约，不改成隐式成功或无条件重抛。

## 5. TDD与交付

1. 先增加共享状态/错误/素材域测试，观察缺少契约的红测试；保存恢复先补行为锁定测试。
2. 最小重构后跑定向契约与所有Provider fixture测试；原测试不删、不放宽。
3. 顺序门禁：typecheck → test:run → build:mock → PLAYWRIGHT_OFFLINE_DIST=dist Playwright。
4. 全新测试上下文，不清用户数据。备份并恢复自动化会覆写的既有QA证据，避免混入历史截图。
5. 更新本批审计报告后提交推送。若需回滚，revert本批提交；无需数据库回滚。
