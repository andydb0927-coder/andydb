# 回归测试映射

| 缺陷/风险 | 修复前失败证据 | 最小修复 | 回归 |
|---|---|---|---|
| BUG-001 preview base与build不一致 | 实际预览白屏；deployment-config断言先红 | preview与build共同使用/andydb/ | deployment-config.test；mock构建后默认preview实际打开 |
| BUG-003 未知路由无恢复 | 中文页面不存在断言先红 | 统一安全恢复页、catch-all、加载占位 | RouteErrorPage.test 2项；navigation failures E2E |
| BUG-004 连续新建重复项目 | quick-create并发预期save=1实际2；浏览器2个项目 | WeakMap按repository和完整请求URL合并进行中的保存；finally释放 | quick-create测试含失败后重试和不同意图；rapid new-project E2E |
| BUG-005 浅色系统偏好下暗色标题黑字 | 浏览器色值近黑；可读性断言先红 | 移除脚手架h1/h2强制色，继承产品表面文字色 | light/dark系统偏好E2E；前后截图 |
| BUG-006 Skills窄屏溢出 | 721宽溢出214px；800宽137px | 既有select规则设置min-width:0与容器宽度 | 1024/853/819/800/721无横溢出E2E |
| BUG-007 空视频提交及列表旧生成路径 | VideoNode空输入按钮预期disabled实际enabled；NodeList预期generate实际regenerate | UI按钮复用提示词/媒体条件；列表发出标准generate动作 | 新增2项单测；node-list regeneration E2E且请求数为0 |
| BUG-010 缩放控件白底白图标 | zoom controls红测试实测1.06:1而要求至少3:1 | 使用React Flow公开主题变量，删除失效的同权重覆盖 | Zoom In/Zoom Out/Fit View普通与悬停态对比度E2E |
| BUG-011 缩放控件被小地图遮挡 | hover真实命中失败；实机控件宽1170px | Controls position=top-right；删除冲突的基础left/right/bottom定位 | 默认1280及1440/1024/800/721/720实际命中；小地图开启不冲突 |
| BUG-012 窄屏引导卡覆盖小地图 | 720x450点击被开始创作区拦截 | 视图栏与引导区共用高度和底偏移，计算避让 | 小地图点击、空画布引导原测试及Agent开启后缩放命中 |
| BUG-013 多结果网格被composer覆盖 | 几何断言网格bottom=1231而composer top=717；结构单测先红 | ImageResults移出固定高媒体article，成为composer之前的正常流同级内容 | AssetNode保持主图确认等原断言；四图边界不重叠和4个下载按钮hover实际命中 |
| 原有输入/持久化 | 不修改API与数据库模型 | 仅增加保护测试 | project edits E2E、六组画布编辑视口、timeline editing |
| 原始通知偶发失败 | 基线77/78；确认弹窗等待超时 | 未盲改产品或删测试 | 同一原始测试单跑3次+并发重复12次通过；最终全量继续保留 |

红阶段的准确错误写在上表；原始全量日志固定在`evidence/baseline/`。本轮定向测试中的错误定位/可访问名称歧义在测试开发期间修正，不冒充产品缺陷。

## 非回归约束

- `app/src/features/generation/`整目录、`.env*`、数据库schema和迁移不改。
- 保留原有78项Playwright，不skip、不删；增加专项浏览器测试。
- 保留所有原有单元测试；新增路由、并发创建、视频资格与列表动作测试。
- 与付费生成相关的测试均使用fixture Key和拦截响应；真实外网生成域名被阻断。
