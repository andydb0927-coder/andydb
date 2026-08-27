# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hosted-batch-5.spec.ts >> shows generation task notifications and persists the read state
- Location: e2e/hosted-batch-5.spec.ts:16:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '确认生成 1 张图片' })

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - complementary [ref=f1e4]:
    - button "收起平台导航" [ref=f1e5] [cursor=pointer]
    - generic [ref=f1e9]: 无线画布
    - link "新建项目" [ref=f1e16] [cursor=pointer]:
      - /url: /projects/new
    - navigation "平台导航" [ref=f1e19]:
      - link "首页" [ref=f1e20] [cursor=pointer]:
        - /url: /
      - link "项目" [ref=f1e25] [cursor=pointer]:
        - /url: /projects
      - link "作品" [ref=f1e29] [cursor=pointer]:
        - /url: /works
      - link "Skills" [ref=f1e36] [cursor=pointer]:
        - /url: /agents
      - link "创作者挑战赛" [ref=f1e41] [cursor=pointer]:
        - /url: /challenges
      - link "积分会员" [ref=f1e49] [cursor=pointer]:
        - /url: /membership
      - link "帮助" [ref=f1e54] [cursor=pointer]:
        - /url: /help
    - button "打开阶段任务" [ref=f1e59] [cursor=pointer]:
      - generic [ref=f1e63]: 阶段任务
  - main [ref=f1e65]:
    - generic [ref=f1e66]:
      - generic [ref=f1e67]:
        - generic [ref=f1e68]: W
        - generic [ref=f1e69]:
          - generic [ref=f1e70]:
            - heading "未命名项目 · 2026-08-27 21:43" [level=1] [ref=f1e71]
            - button "编辑项目名" [ref=f1e72] [cursor=pointer]
          - generic [ref=f1e76]: 已保存
        - button "画布 1" [ref=f1e80] [cursor=pointer]
      - generic "工作区模式" [ref=f1e83]:
        - button "工作流" [pressed] [ref=f1e84] [cursor=pointer]
        - button "故事板" [ref=f1e85] [cursor=pointer]
      - generic [ref=f1e86]:
        - button "撤销" [disabled] [ref=f1e87]
        - button "重做" [disabled] [ref=f1e91]
      - generic [ref=f1e95]:
        - button "节点列表" [ref=f1e96] [cursor=pointer]
        - button "本地设置，本机创作者" [ref=f1e101] [cursor=pointer]: 本
        - button "发布与分享" [ref=f1e103] [cursor=pointer]
        - button "Agent" [ref=f1e109] [cursor=pointer]: 打开 Agent
    - button "导入工作流 JSON 文件" [ref=f1e113]
    - region "项目画布" [ref=f1e114]:
      - generic [ref=f1e115]:
        - application "创作节点图" [ref=f1e116]:
          - generic [ref=f1e118] [cursor=pointer]:
            - generic:
              - generic:
                - img:
                  - group "角色参考 → 分镜 01" [ref=f1e119]
                - img:
                  - group "场景设定 → 分镜 01" [ref=f1e123]
              - generic:
                - group [ref=f1e127]:
                  - generic [ref=f1e128]:
                    - textbox "节点名称" [ref=f1e129]: 角色参考
                    - article [ref=f1e130]:
                      - button "角色参考" [ref=f1e131]:
                        - generic [ref=f1e132]: 960 × 1200
                      - button "连接到角色参考" [ref=f1e133]: +
                      - button "从角色参考建立连接" [ref=f1e134]: +
                - group [ref=f1e135]:
                  - generic [ref=f1e136]:
                    - textbox "节点名称" [ref=f1e137]: 场景设定
                    - article [ref=f1e138]:
                      - button "场景设定" [ref=f1e139]:
                        - generic [ref=f1e140]: 1600 × 900
                      - button "查看 4 张结果" [ref=f1e141]: 4张
                      - button "连接到场景设定" [ref=f1e142]: +
                      - button "从场景设定建立连接" [ref=f1e143]: +
                    - generic:
                      - region "场景设定 生成参数":
                        - toolbar "图片主操作":
                          - button "参考" [ref=f1e144]
                          - button "标记" [ref=f1e152]
                          - button "风格" [ref=f1e160]
                        - button "放大编辑区" [ref=f1e164]
                        - textbox "提示词" [ref=f1e170]
                        - generic:
                          - button "打开 Slash 命令" [ref=f1e171]: /
                          - button "本地优化提示词" [ref=f1e174]:
                            - text: 优化
                            - generic [ref=f1e178]: 待接入
                        - generic:
                          - generic [ref=f1e183]:
                            - generic [ref=f1e184]: 图片模型
                            - combobox "图片模型" [ref=f1e185]:
                              - option "火山方舟 · Seedream 5.0 Pro · 文生图 / 图生图 / 图片编辑 · 18 积分/次 · 开发直连" [selected]
                          - generic: 开发直连
                          - generic: 文生图 / 图生图 / 图片编辑
                          - button "图片生成参数" [ref=f1e186]:
                            - generic: 2816×1584 · 2K · 1张
                          - button "图片创作模板" [ref=f1e189]
                          - button "翻译提示词" [disabled] [ref=f1e193]
                          - button "展开高级设置" [ref=f1e198]
                          - generic:
                            - generic "预计成本 18"
                            - button "生成图片，预计成本 18" [active] [ref=f1e200]:
                              - generic [ref=f1e203]: 生成
                        - paragraph: 翻译服务未接入，本地演示暂不可用。
                - group [ref=f1e204]:
                  - article [ref=f1e206]:
                    - button "分镜 01" [ref=f1e207]:
                      - generic [ref=f1e208]:
                        - generic [ref=f1e209]: 分镜
                        - strong [ref=f1e215]: 分镜 01
                      - generic [ref=f1e216]: 首个叙事分镜，宽银幕构图，建立人物与环境关系。创作意图：从电影感叙事开始自由创作
                      - generic [ref=f1e217]: 就绪
                    - button "连接到分镜 01" [ref=f1e220]
                    - button "从分镜 01建立连接" [ref=f1e221]
          - generic "Control Panel" [ref=f1e222]:
            - button "Zoom In" [ref=f1e223] [cursor=pointer]
            - button "Zoom Out" [ref=f1e226] [cursor=pointer]
            - button "Fit View" [ref=f1e229] [cursor=pointer]
          - generic:
            - link "React Flow attribution":
              - /url: https://reactflow.dev/attribution
              - text: React Flow
        - toolbar "画布模式工具" [ref=f1e233]:
          - group "无线画布工具坞" [ref=f1e234]:
            - button "添加节点" [ref=f1e235] [cursor=pointer]
            - button "移动" [pressed] [ref=f1e238] [cursor=pointer]
            - button "连线" [ref=f1e245] [cursor=pointer]
            - button "打开工具箱" [ref=f1e254] [cursor=pointer]:
              - generic [ref=f1e257]: 工具箱
            - button "资产管理" [ref=f1e258] [cursor=pointer]
            - button "素材库" [ref=f1e262] [cursor=pointer]
            - button "角色库" [ref=f1e266] [cursor=pointer]
            - button "历史记录" [ref=f1e272] [cursor=pointer]:
              - generic [ref=f1e277]: 历史
            - button "快捷键" [ref=f1e278] [cursor=pointer]
            - button "教程" [ref=f1e282] [cursor=pointer]
          - generic "画布辅助操作" [ref=f1e287]:
            - button "分组" [disabled] [ref=f1e288]
            - button "隐藏连线" [pressed] [ref=f1e289] [cursor=pointer]
        - button "上传画布素材" [ref=f1e290]
        - toolbar "画布视图" [ref=f1e291]:
          - button "显示小地图" [ref=f1e292] [cursor=pointer]
          - button "开启网格吸附" [ref=f1e295] [cursor=pointer]
          - button "适配画布" [ref=f1e298] [cursor=pointer]
          - generic "画布缩放比例" [ref=f1e301]: 73%
        - toolbar "图片创作工具":
          - button "人像质感调节" [ref=f1e302] [cursor=pointer]:
            - generic [ref=f1e307]: NEW
          - button "全景" [ref=f1e310] [cursor=pointer]:
            - generic [ref=f1e311]: "720"
            - text: 全景
          - button "全景预览" [ref=f1e312] [cursor=pointer]:
            - generic [ref=f1e313]: "720"
            - text: 全景预览
          - button "多角度" [ref=f1e314] [cursor=pointer]
          - button "打光" [ref=f1e319] [cursor=pointer]
          - button "九宫格" [ref=f1e322] [cursor=pointer]
          - button "高清" [disabled] [ref=f1e327]:
            - text: 高清
            - generic [ref=f1e333]: 待接入
          - button "扩图" [ref=f1e338] [cursor=pointer]
          - button "擦除" [ref=f1e339] [cursor=pointer]
          - button "抠像" [disabled] [ref=f1e340]:
            - text: 抠像
            - generic [ref=f1e341]: 待接入
          - button "宫格切分" [ref=f1e346] [cursor=pointer]
          - button "标注" [ref=f1e351] [cursor=pointer]
          - button "旋转与镜像" [ref=f1e356] [cursor=pointer]
          - button "下载" [ref=f1e361] [cursor=pointer]
          - button "预览" [ref=f1e366] [cursor=pointer]
          - generic: 提示词全景：2:1 图片，不保证等距柱状投影或接缝准确；请在全景查看器中复核。
          - generic: 串行生成 9 张独立图片并排为 3×3；同一参考图辅助一致性，不保证角色/空间完全一致。
        - generic [ref=f1e373]: 暂未开放：火山方舟未提供独立 2x/4x 图片超分接口，不能用重绘冒充高清放大。
        - generic [ref=f1e374]: 暂未开放：当前火山方舟接口未提供自动抠像；透明背景模式要求输入图片已带透明通道。
      - complementary "场景设定评论":
        - generic:
          - generic:
            - strong: 变更注释
          - generic:
            - generic: 0 条待处理
            - button "折叠评论面板" [ref=f1e375] [cursor=pointer]
        - paragraph: 场景设定 · 本地模拟
        - list
        - generic:
          - generic: 评论内容
          - textbox "评论内容" [ref=f1e378]:
            - /placeholder: 记录节点或片段的修改意见
        - button "添加评论" [disabled] [ref=f1e379]
```

# Test source

```ts
  1  | import { expect, test, createFixtureCinematicProject } from './provider-fixture'
  2  | 
  3  | test('opens membership and help from the platform rail', async ({ page }) => {
  4  |   await page.goto('/membership')
  5  |   await expect(page.getByRole('heading', { name: '积分与会员' })).toBeVisible()
  6  |   await expect(page.getByText('120')).toBeVisible()
  7  |   await expect(page.getByRole('button', { name: '支付待接入' })).toHaveCount(2)
  8  | 
  9  |   await page.getByRole('link', { name: '帮助', exact: true }).click()
  10 |   await expect(page.getByRole('heading', { name: '帮助中心' })).toBeVisible()
  11 |   await page.getByRole('searchbox', { name: '搜索帮助内容' }).fill('AutoLink')
  12 |   await expect(page.getByText('AutoLink 如何建立素材引用？')).toBeVisible()
  13 |   await expect(page.getByText('找到 1 条帮助')).toBeVisible()
  14 | })
  15 | 
  16 | test('shows generation task notifications and persists the read state', async ({ page }) => {
  17 |   await createFixtureCinematicProject(page)
  18 |   await page.getByRole('button', { name: '适配画布' }).click()
  19 |   await page.getByRole('button', { name: '场景设定', exact: true }).click()
  20 |   const composer = page.getByRole('region', { name: '场景设定 生成参数' })
  21 |   await composer.getByRole('button', { name: '生成图片，预计成本 18' }).click()
> 22 |   await page.getByRole('button', { name: '确认生成 1 张图片' }).click()
     |                                                          ^ Error: locator.click: Test timeout of 30000ms exceeded.
  23 |   await expect(page.getByText('Seedream 5.0 Pro结果已保存到项目与生成历史。')).toBeVisible()
  24 | 
  25 |   const avatar = page.getByRole('button', { name: /本地设置/ })
  26 |   await expect(avatar).toHaveAccessibleName(/本地设置/)
  27 |   await avatar.click()
  28 |   await page.getByRole('button', { name: /通知 1 条未读/ }).click()
  29 |   const center = page.getByRole('dialog', { name: '通知中心' })
  30 |   await expect(center.getByText('图片生成完成')).toBeVisible()
  31 |   await center.getByRole('button', { name: '全部标为已读' }).click()
  32 |   await center.getByRole('button', { name: '完成' }).click()
  33 | 
  34 |   await page.reload()
  35 |   await page.getByRole('button', { name: /本地设置/ }).click()
  36 |   await expect(page.getByRole('button', { name: '通知' })).toBeVisible()
  37 | })
  38 | 
```