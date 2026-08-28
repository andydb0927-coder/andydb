export type HelpCategoryId = 'account' | 'canvas' | 'generation' | 'assets' | 'publishing'

export interface HelpFaq {
  id: string
  question: string
  answer: string
}

export interface HelpCategory {
  id: HelpCategoryId
  title: string
  description: string
  faqs: HelpFaq[]
}

export const helpCategories: HelpCategory[] = [
  {
    id: 'account',
    title: '账号',
    description: '本地身份、主题、通知与数据范围。',
    faqs: [
      { id: 'account-local', question: '当前账号数据保存在哪里？', answer: '显示名称、主题、已读通知等偏好保存在当前浏览器；项目、资产和生成历史保存在 IndexedDB。' },
      { id: 'account-theme', question: '如何切换深色或浅色模式？', answer: '进入画布后点击右上角头像，在“模式切换”中选择深色或浅色，设置会保存在当前浏览器。' },
      { id: 'account-sync', question: '不同浏览器之间会自动同步吗？', answer: '不会。当前版本没有云端账户同步，换浏览器或设备时需要导出工作流 JSON 后手动导入。' },
      { id: 'account-notice', question: '通知中心显示哪些内容？', answer: '通知中心读取当前项目真实生成任务状态，显示已提交、生成中、完成、失败或取消，并持久化已读状态。' },
    ],
  },
  {
    id: 'canvas',
    title: '画布',
    description: '节点、连线、多画布与快捷操作。',
    faqs: [
      { id: 'canvas-node', question: '如何添加节点？', answer: '双击画布空白处，或点击底部“添加节点”，再选择文本、图片、视频、音频等节点类型。' },
      { id: 'canvas-edge', question: '如何手动建立节点连线？', answer: '拖动节点两侧端口连接上下游，也可以在图片节点点击“参考”后选择画布中的另一个节点。' },
      { id: 'canvas-multi', question: '如何使用多个画布？', answer: '点击顶栏“画布 1”下拉菜单，可以新建、重命名、切换或删除画布；各画布独立保存节点、连线和视口。' },
      { id: 'canvas-shortcuts', question: '在哪里查看画布快捷键？', answer: '点击底部工具坞“快捷键”，可查看缩放、移动、连线、复制、分组、撤销与删除等快捷键。' },
      { id: 'canvas-autolink', question: 'AutoLink 如何建立素材引用？', answer: '输入提示词时开启 AutoLink，系统会按关键词与标签匹配当前画布素材、角色和资产；选择候选后自动插入 @引用并建立引用边。' },
    ],
  },
  {
    id: 'generation',
    title: '生成',
    description: '模型选择、参数、队列与失败处理。',
    faqs: [
      { id: 'generation-model', question: '如何选择生成模型？', answer: '选中生成节点，在节点下方参数面板打开“模型”选择器；模型会按官方 API、待接入和本地演示分组。' },
      { id: 'generation-prompt', question: '为什么生成按钮不可用？', answer: '请确认已填写提示词或添加参考媒体、模型配置可用，并且预计成本已经显示；待接入模型会明确展示禁用原因。' },
      { id: 'generation-history', question: '在哪里查看生成历史？', answer: '点击底部工具坞“历史记录”，可以按图片、视频、音频筛选，查看、使用、下载或重新发送到画布。' },
      { id: 'generation-retry', question: '生成失败后如何重试？', answer: '在生成历史或失败节点状态中选择重试，系统会复用完整提示词、模型、参数与引用配置重新入队。' },
      { id: 'generation-local', question: '“本地演示”和“官方 API 已接”有什么区别？', answer: '本地演示使用确定性 Mock，不产生真实费用；官方 API 已接会按开发配置调用供应商，产生真实模型费用。' },
    ],
  },
  {
    id: 'assets',
    title: '资产',
    description: '上传、资产管理、主体与生成结果。',
    faqs: [
      { id: 'assets-upload', question: '支持上传哪些文件？', answer: '资产管理支持图片、视频和音频；完成类型校验后可本地预览、入库并发送到画布创建对应节点。' },
      { id: 'assets-manage', question: '如何重命名或移动资产？', answer: '打开“资产管理”，在文件夹树或资产右键菜单中执行重命名、移动和删除，操作会写入 IndexedDB。' },
      { id: 'assets-delete', question: '删除正在被节点使用的资产会怎样？', answer: '系统会先列出受影响的节点引用并要求确认，避免无提示地破坏画布内容。' },
      { id: 'assets-subject', question: '如何把人物结果保存为主体？', answer: '右键图片结果节点选择“创建主体”，填写名称、描述和标签后保存；主体可在角色库跨项目复用。' },
      { id: 'assets-live', question: '真实生成结果刷新后还在吗？', answer: '已完成的 Live 结果会写入节点版本、项目资产和生成历史；项目保存后刷新仍可查看、下载和再次使用。' },
    ],
  },
  {
    id: 'publishing',
    title: '发布',
    description: '预览、导出、发布作品与分享链接。',
    faqs: [
      { id: 'publish-preview', question: '如何预览成片？', answer: '点击画布顶栏“发布与分享”，选择“预览”进入成片预览页；已有时间线内容会按顺序播放。' },
      { id: 'publish-work', question: '如何发布到作品页？', answer: '在“发布与分享”中选择“在 LibTV 上发布”，填写标题、简介、封面和标签后提交，本地作品会出现在“作品”页。' },
      { id: 'publish-share', question: '分享链接是否已经上传云端？', answer: '当前分享链接用于本地演示，复制时会提示“未发布到云端”；同一浏览器可打开只读查看页。' },
      { id: 'publish-canvas', question: '可以导出整个画布吗？', answer: '可以。在“发布与分享”中选择“导出画布”，支持当前视口或全画布范围的 PNG、SVG。' },
      { id: 'publish-json', question: '如何备份或迁移工作流？', answer: '从“发布与分享”导出工作流 JSON；导入时系统会校验结构并提示重名节点或引用缺失。' },
      { id: 'works-favorites', question: '如何收藏和筛选作品？', answer: '在“作品”卡片或详情点击“收藏”；作品页勾选“只看收藏”进入本地收藏夹。可同时搜索标题、摘要、标签或模型，按模型和公开标记筛选，选择最新创作、最早创作或标题排序。收藏写入当前浏览器 IndexedDB。' },
      { id: 'works-visibility', question: '作品公开标记会上传云端吗？', answer: '不会。“公开标记”中的“公开 · 本地”和“私密 · 本地”仅为本地管理标记，不上传云端，也不提供访问权限控制。旧作品默认私密，重新发布保留收藏与标记。' },
      { id: 'works-poster', question: '如何导出作品 PNG 长图？', answer: '进入作品详情，在“导出与分享”点击“导出 PNG 长图”。图片包含封面、标题、简介、创建者、模型和创作时间；二维码为预留位，不可扫描。若封面过期或跨域禁止读取，将提示失败，不会生成空白长图。' },
      { id: 'works-package', question: '项目包 JSON 包含什么？', answer: '作品详情点击“导出项目包 JSON”，可下载发布时的项目完整快照、节点参数与位置、连线、独立时间线、作品信息及资产 ID 清单；可从画布“导入工作流 JSON”导入。外部媒体仅保留 URL，不包含媒体二进制文件，链接到期后可能无法读取。' },
      { id: 'works-statistics', question: '作品数据看板如何统计？', answer: '按个人已发布作品的冻结生成历史统计，排除首页内置示例。模型次数为按项目与任务 ID 去重的成功任务数，不是出图张数；积分优先使用已记消耗，缺失时使用成功任务估算，未知费用会提示。并非供应商账单，也不包含发布后的生成任务。' },
    ],
  },
]
