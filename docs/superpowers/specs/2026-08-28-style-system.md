# 风格系统真实化

## 范围与边界

基于 076e40a，保留现有模型、生成队列与项目数据。仅使用 fixture 验证，不调用付费 API。风格是本地提示词模板，不是训练模型，不增设模型下拉条目。

## 数据契约

- StyleCard：id/name/promptFragment/compatibility（targetKinds + 可选 providerIds）及封面、作者、分类等展示字段。
- 节点 appliedStyle 保存不可变的模板快照；任务 generationConfig.style 保存提交时快照，历史重发不受目录后续修改影响。旧项目无此字段仍可加载；null 明确表示移除风格。
- IndexedDB 新增 styles（自定义卡）与 stylePreferences（收藏、最近使用）；不删除或改变原有表。
- 自定义名称/片段必填并限长，可选本地图片封面限制类型与大小；不接 AI 训练。

## 生成语义

- 图片/视频：注册表分发前将风格片段置于 prompt 前部；原始输入、节点版本与历史保留未拼接输入，防止重试重复前缀。
- 文本：风格片段进入 Chat Completions system 消息；保留剧本 JSON 等既有系统约束，不替换协议。
- 兼容性在选择器与注册表双重校验；换模型后不兼容时给出原因，可移除或重选，不静默忽略。
- composer 摘要及图片提交确认显示风格名；风格不替代必填提示词，也不改变已有成本口径。

## TDD 与验收

先验证失败：风格目录/兼容性、三种请求前缀与原始提示词、任务快照、IndexedDB 重开收藏和自定义卡；再实现共享风格选择器（筛选/详情/收藏/应用/移除/自定义/选中高亮）并接入图片、视频、文本和脚本 composer。

E2E 拦截生成网络，覆盖自定义/收藏刷新恢复、图片/视频请求与豆包 system 前缀、历史快照。依次 typecheck → test:run → build:mock → offline-dist Playwright。保留所有既有失败测试与用户在途截图；提交前恢复被门禁覆盖的旧证据，仅提交本批文件。
