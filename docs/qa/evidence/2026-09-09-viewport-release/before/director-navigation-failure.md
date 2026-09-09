# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: creation-flow.spec.ts >> edits and persists all specialized Liblib node detail panels
- Location: e2e/creation-flow.spec.ts:1433:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('region', { name: '导演台 01 导演台参数' }).getByRole('button', { name: '添加立方体' })
    - locator resolved to <button type="button">添加立方体</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - element is outside of the viewport
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <canvas role="img" width="664" height="360" data-renderer="ready" aria-label="导演台 01 3D视口" data-camera-motion="idle" data-engine="three.js r185"></canvas> from <div role="group" data-renderer="ready" aria-label="导演台 01 3D场景操作" class="director-3d__viewport nodrag nopan nowheel">…</div> subtree intercepts pointer events
  35 × retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - element is outside of the viewport
  2 × retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <canvas role="img" width="664" height="360" data-renderer="ready" aria-label="导演台 01 3D视口" data-camera-motion="idle" data-engine="three.js r185"></canvas> from <div role="group" data-renderer="ready" aria-label="导演台 01 3D场景操作" class="director-3d__viewport nodrag nopan nowheel">…</div> subtree intercepts pointer events
  3 × retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
  - retrying click action
    - waiting 500ms

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
            - heading "未命名项目 · 2026-09-09 23:39" [level=1] [ref=f1e71]
            - button "编辑项目名" [ref=f1e72] [cursor=pointer]
          - generic [ref=f1e76]: 已保存
        - button "画布 1" [ref=f1e80] [cursor=pointer]
      - generic "工作区模式" [ref=f1e83]:
        - button "工作流" [pressed] [ref=f1e84] [cursor=pointer]
        - button "故事板" [ref=f1e85] [cursor=pointer]
      - generic [ref=f1e86]:
        - button "撤销" [ref=f1e87] [cursor=pointer]
        - button "重做" [disabled] [ref=f1e91]
      - generic [ref=f1e95]:
        - button "管线自动化" [ref=f1e96] [cursor=pointer]
        - button "节点列表" [ref=f1e101] [cursor=pointer]
        - link "邀请码登录" [ref=f1e105] [cursor=pointer]:
          - /url: /login
        - button "本地设置，本机创作者" [ref=f1e110] [cursor=pointer]: 本
        - button "发布与分享" [ref=f1e113] [cursor=pointer]
        - button "Agent" [ref=f1e119] [cursor=pointer]: 打开 Agent
    - button "导入工作流 JSON 文件" [ref=f1e123]
    - region "项目画布" [ref=f1e124]:
      - generic [ref=f1e125]:
        - application "创作节点图" [ref=f1e126]:
          - generic [ref=f1e128] [cursor=pointer]:
            - generic:
              - generic:
                - img:
                  - group "角色参考 → 分镜 01" [ref=f1e129]
                - img:
                  - group "场景设定 → 分镜 01" [ref=f1e133]
              - generic:
                - group [ref=f1e137]:
                  - generic [ref=f1e138]:
                    - textbox "节点名称" [ref=f1e139]: 角色参考
                    - article [ref=f1e140]:
                      - button "角色参考" [ref=f1e141]:
                        - generic [ref=f1e142]: 960 × 1200
                      - button "连接到角色参考" [ref=f1e143]: +
                      - button "从角色参考建立连接" [ref=f1e144]: +
                - group [ref=f1e145]:
                  - generic [ref=f1e146]:
                    - textbox "节点名称" [ref=f1e147]: 场景设定
                    - article [ref=f1e148]:
                      - button "场景设定" [ref=f1e149]:
                        - generic [ref=f1e150]: 1600 × 900
                      - button "连接到场景设定" [ref=f1e151]: +
                      - button "从场景设定建立连接" [ref=f1e152]: +
                    - button "查看 4 张结果" [ref=f1e153]: 4张
                - group [ref=f1e154]:
                  - article [ref=f1e156]:
                    - button "分镜 01" [ref=f1e157]:
                      - generic [ref=f1e158]:
                        - generic [ref=f1e159]: 分镜
                        - strong [ref=f1e165]: 分镜 01
                      - generic [ref=f1e166]: 首个叙事分镜，宽银幕构图，建立人物与环境关系。创作意图：从电影感叙事开始自由创作
                      - generic [ref=f1e167]: 就绪
                    - button "连接到分镜 01" [ref=f1e170]
                    - button "从分镜 01建立连接" [ref=f1e171]
                - group [ref=f1e172]:
                  - generic [ref=f1e173]:
                    - textbox "节点名称" [ref=f1e174]: 文本 01
                    - article [ref=f1e175]:
                      - button "文本 01" [ref=f1e176]
                      - toolbar "文本快捷尝试" [ref=f1e179]:
                        - generic [ref=f1e180]: 尝试：
                        - button "自己编写内容" [ref=f1e181]
                        - button "文生视频" [ref=f1e185]
                        - button "图片反推提示词" [ref=f1e191]
                        - button "文字生音乐" [ref=f1e197]
                      - button "连接到文本 01" [ref=f1e201]: +
                      - button "从文本 01建立连接" [ref=f1e202]: +
                - group [ref=f1e203]:
                  - article [ref=f1e205]:
                    - button "脚本 01" [ref=f1e206]:
                      - generic [ref=f1e207]:
                        - generic [ref=f1e208]: 脚本节点
                        - strong [ref=f1e211]: 脚本 01
                    - button "连接到脚本 01" [ref=f1e212]
                    - button "从脚本 01建立连接" [ref=f1e213]
                - group [ref=f1e214]:
                  - article [ref=f1e216]:
                    - button "音频 01" [ref=f1e217]:
                      - generic [ref=f1e218]:
                        - generic [ref=f1e219]: 音频节点
                        - strong [ref=f1e222]: 音频 01
                    - button "连接到音频 01" [ref=f1e223]
                    - button "从音频 01建立连接" [ref=f1e224]
                - group [ref=f1e225]:
                  - article [ref=f1e227]:
                    - button "导演台 01" [active] [ref=f1e228]:
                      - generic [ref=f1e229]:
                        - generic [ref=f1e230]: 导演台节点
                        - strong [ref=f1e233]: 导演台 01
                    - region "导演台 01 导演台参数" [ref=f1e234]:
                      - generic [ref=f1e235]:
                        - generic [ref=f1e236]: NODE PARAMETERS
                        - strong [ref=f1e237]: 导演台参数
                      - list "分镜编排列表" [ref=f1e238]:
                        - listitem [ref=f1e239]:
                          - generic [ref=f1e240]: "01"
                          - generic [ref=f1e241]:
                            - text: 分镜名称
                            - textbox "远景建立分镜名称" [ref=f1e242]: 远景建立
                          - generic [ref=f1e243]:
                            - text: 机位提示
                            - textbox "远景建立机位提示" [ref=f1e244]: 广角稳定机位，交代环境与人物关系
                          - generic [ref=f1e245]:
                            - button "上移远景建立" [disabled] [ref=f1e246]
                            - button "下移远景建立" [ref=f1e249]
                            - button "删除远景建立" [ref=f1e252]
                        - listitem [ref=f1e256]:
                          - generic [ref=f1e257]: "02"
                          - generic [ref=f1e258]:
                            - text: 分镜名称
                            - textbox "人物入画分镜名称" [ref=f1e259]: 人物入画
                          - generic [ref=f1e260]:
                            - text: 机位提示
                            - textbox "人物入画机位提示" [ref=f1e261]: 中景滑轨前推，保持视线高度
                          - generic [ref=f1e262]:
                            - button "上移人物入画" [ref=f1e263]
                            - button "下移人物入画" [disabled] [ref=f1e266]
                            - button "删除人物入画" [ref=f1e269]
                      - button "新增分镜" [ref=f1e273]
                      - generic [ref=f1e275]:
                        - button "深度动作捕捉" [disabled] [ref=f1e276]:
                          - text: 深度动作捕捉
                          - generic [ref=f1e277]: 待接入
                        - generic [ref=f1e282]: 待接入深度动作捕捉服务，预计成本 30 积分。
                      - region "导演台3D场景" [ref=f1e283]:
                        - generic [ref=f1e284]:
                          - generic [ref=f1e285]:
                            - strong [ref=f1e286]: 3D 导演视口
                            - generic [ref=f1e287]: 本地场景 · 布光 / 机位 / 运镜
                          - button "导出场景快照 PNG 到画布" [ref=f1e288]
                          - button "导出四视图 PNG 到画布" [ref=f1e289]
                        - generic [ref=f1e290]:
                          - group "导演台 01 3D场景操作" [ref=f1e291]:
                            - img "导演台 01 3D视口" [ref=f1e292]
                          - complementary "3D对象树面板" [ref=f1e293]:
                            - strong [ref=f1e294]: 本地 3D 资产 · 拖入视口
                            - group "本地3D资产库" [ref=f1e295]:
                              - button "添加桌子" [ref=f1e296]
                              - button "添加椅子" [ref=f1e297]
                              - button "添加树" [ref=f1e298]
                              - button "添加柱体" [ref=f1e299]
                            - strong [ref=f1e300]: 对象树
                            - generic "添加3D对象" [ref=f1e301]:
                              - button "添加立方体" [ref=f1e302]
                              - button "添加球体" [ref=f1e303]
                              - button "添加圆柱" [ref=f1e304]
                              - button "添加平面" [ref=f1e305]
                              - button "添加人形素模" [ref=f1e306]
                            - tree "3D对象树" [ref=f1e307]:
                              - treeitem "人形素模 01 人形素模" [selected] [ref=f1e308]:
                                - button "选择人形素模 01" [ref=f1e309]: 人形素模
                                - textbox "人形素模 01名称" [ref=f1e310]: 人形素模 01
                                - button "删除人形素模 01" [ref=f1e311]: 删除
                        - group "3D相机控制" [ref=f1e312]:
                          - button "透视投影" [pressed] [ref=f1e313]
                          - button "正交投影" [ref=f1e314]
                          - button "顶部视图" [ref=f1e315]
                          - button "前视图" [ref=f1e316]
                          - button "侧视图" [ref=f1e317]
                          - button "自由视图" [pressed] [ref=f1e318]
                          - button "AI 运镜生成（待接入）" [disabled] [ref=f1e319]
                        - paragraph [ref=f1e320]: 待接入运动运镜生成
                        - group "相机预设" [ref=f1e321]:
                          - button "特写机位" [ref=f1e322]
                          - button "中景机位" [ref=f1e323]
                          - button "全景机位" [ref=f1e324]
                          - button "低角度机位" [ref=f1e325]
                          - generic [ref=f1e326]:
                            - text: 焦距
                            - spinbutton "相机焦距（毫米）" [ref=f1e327]
                            - text: mm
                        - group [ref=f1e328]:
                          - generic "灯光布置" [ref=f1e329]
                          - group "灯光预设" [ref=f1e330]:
                            - button "三点布光" [ref=f1e331]
                            - button "侧逆光" [ref=f1e332]
                            - button "顶光" [ref=f1e333]
                            - button "轮廓光" [ref=f1e334]
                          - generic [ref=f1e335]:
                            - generic [ref=f1e336]:
                              - text: 定位灯光
                              - combobox "当前编辑灯光" [ref=f1e337]:
                                - option "主光" [selected]
                            - generic [ref=f1e338]:
                              - generic [ref=f1e339]:
                                - generic [ref=f1e340]: X
                                - spinbutton "主光 X" [ref=f1e341]: "5"
                              - generic [ref=f1e342]:
                                - generic [ref=f1e343]: "Y"
                                - spinbutton "主光 Y" [ref=f1e344]: "8"
                              - generic [ref=f1e345]:
                                - generic [ref=f1e346]: Z
                                - spinbutton "主光 Z" [ref=f1e347]: "6"
                          - text: 拖动视口内灯光手柄定位，也可输入 XYZ。超出视野时请切换全景机位或输入坐标。
                        - group [ref=f1e348]:
                          - generic "运镜轨迹预览" [ref=f1e349]
                    - button "连接到导演台 01" [ref=f1e350]
                    - button "从导演台 01建立连接" [ref=f1e351]
          - generic "Control Panel" [ref=f1e352]:
            - button "Zoom In" [ref=f1e353] [cursor=pointer]
            - button "Zoom Out" [ref=f1e356] [cursor=pointer]
            - button "Fit View" [ref=f1e359] [cursor=pointer]
          - generic:
            - link "React Flow attribution":
              - /url: https://reactflow.dev/attribution
              - text: React Flow
        - toolbar "画布模式工具" [ref=f1e363]:
          - group "无线画布工具坞" [ref=f1e364]:
            - button "添加节点" [ref=f1e365] [cursor=pointer]
            - button "移动" [pressed] [ref=f1e368] [cursor=pointer]
            - button "连线" [ref=f1e375] [cursor=pointer]
            - button "打开工具箱" [ref=f1e384] [cursor=pointer]:
              - generic [ref=f1e387]: 工具箱
            - button "资产管理" [ref=f1e388] [cursor=pointer]
            - button "素材库" [ref=f1e392] [cursor=pointer]
            - button "角色库" [ref=f1e396] [cursor=pointer]
            - button "历史记录" [ref=f1e402] [cursor=pointer]:
              - generic [ref=f1e407]: 历史
            - button "快捷键" [ref=f1e408] [cursor=pointer]
            - button "教程" [ref=f1e412] [cursor=pointer]
          - generic "画布辅助操作" [ref=f1e417]:
            - button "分组" [disabled] [ref=f1e418]
            - button "隐藏连线" [pressed] [ref=f1e419] [cursor=pointer]
        - button "上传画布素材" [ref=f1e420]
        - toolbar "画布视图" [ref=f1e421]:
          - button "显示小地图" [ref=f1e422] [cursor=pointer]
          - button "开启网格吸附" [ref=f1e425] [cursor=pointer]
          - button "适配画布" [ref=f1e428] [cursor=pointer]
          - generic "画布缩放比例" [ref=f1e431]: 73%
        - status: 已创建“导演台 01”，可继续编辑或建立连线。
      - complementary "导演台 01评论":
        - generic:
          - generic:
            - strong: 变更注释
          - generic:
            - generic: 0 条待处理
            - button "折叠评论面板" [ref=f1e432] [cursor=pointer]
        - paragraph: 导演台 01 · 本地模拟
        - list
        - generic:
          - generic: 评论内容
          - textbox "评论内容" [ref=f1e435]:
            - /placeholder: 记录节点或片段的修改意见
        - button "添加评论" [disabled] [ref=f1e436]
```

# Test source

```ts
  1386 |   for (const name of ['文本区', '图片区', '视频区']) {
  1387 |     await expect(storyboard.getByRole('region', { name })).toBeVisible()
  1388 |   }
  1389 |   const stats = storyboard.getByRole('status', { name: '故事板统计' })
  1390 |   await expect(stats).toContainText('总镜头数 3')
  1391 |   await expect(stats).toContainText('总时长 00:00')
  1392 | 
  1393 |   const characterCard = storyboard.getByRole('article', { name: '图片故事板卡 角色参考' })
  1394 |   await expect(characterCard).toContainText('960 × 1200')
  1395 |   await characterCard.getByRole('textbox', { name: '角色参考对白' }).fill('林渊：灯火就在河对岸。')
  1396 |   await characterCard.getByRole('button', { name: '保存角色参考对白' }).click()
  1397 | 
  1398 |   const sceneCard = storyboard.getByRole('article', { name: '图片故事板卡 场景设定' })
  1399 |   const shotCard = storyboard.getByRole('article', { name: '图片故事板卡 分镜 01' })
  1400 |   await shotCard.dragTo(sceneCard)
  1401 |   const imageCards = storyboard.getByRole('region', { name: '图片区' }).getByRole('article')
  1402 |   await expect(imageCards.nth(0)).toHaveAccessibleName('图片故事板卡 角色参考')
  1403 |   await expect(imageCards.nth(1)).toHaveAccessibleName('图片故事板卡 分镜 01')
  1404 |   await expect(imageCards.nth(2)).toHaveAccessibleName('图片故事板卡 场景设定')
  1405 | 
  1406 |   await storyboard.getByRole('button', { name: '收起文本区' }).click()
  1407 |   await expect(storyboard.getByRole('button', { name: '展开文本区' })).toHaveAttribute('aria-expanded', 'false')
  1408 |   await expect(page.getByText('已保存')).toBeVisible()
  1409 |   await page.reload()
  1410 |   await page.getByRole('button', { name: '故事板' }).click()
  1411 |   await expect(page.getByRole('button', { name: '展开文本区' })).toHaveAttribute('aria-expanded', 'false')
  1412 |   await expect(page.getByRole('textbox', { name: '角色参考对白' })).toHaveValue('林渊：灯火就在河对岸。')
  1413 | 
  1414 |   const reloadedCards = page.getByRole('region', { name: '图片区' }).getByRole('article')
  1415 |   await expect(reloadedCards.nth(1)).toHaveAccessibleName('图片故事板卡 分镜 01')
  1416 |   await reloadedCards.nth(2).getByRole('button', { name: '定位 场景设定' }).click()
  1417 |   await expect(page.getByRole('region', { name: '场景设定 生成参数' })).toBeVisible()
  1418 | 
  1419 |   await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  1420 |   await runSelectedNodeManagementAction(page, '扩展镜头')
  1421 |   await page.getByRole('button', { name: '故事板' }).click()
  1422 |   await expect(page.getByRole('article', { name: '图片故事板卡 分镜 02' })).toBeVisible()
  1423 |   await expect(page.getByRole('status', { name: '故事板统计' })).toContainText('总镜头数 4')
  1424 |   await page.getByRole('article', { name: '图片故事板卡 分镜 02' }).getByRole('button', { name: '定位 分镜 02' }).click()
  1425 |   await page.keyboard.press('Delete')
  1426 |   await page.getByRole('button', { name: '故事板' }).click()
  1427 |   await expect(page.getByRole('article', { name: '图片故事板卡 分镜 02' })).toHaveCount(0)
  1428 |   await expect(page.getByRole('status', { name: '故事板统计' })).toContainText('总镜头数 3')
  1429 | 
  1430 |   expect(browserErrors).toEqual([])
  1431 | })
  1432 | 
  1433 | test('edits and persists all specialized Liblib node detail panels', async ({ page }) => {
  1434 |   const browserErrors: string[] = []
  1435 |   page.on('console', (message) => {
  1436 |     if (message.type() === 'error') browserErrors.push(message.text())
  1437 |   })
  1438 |   page.on('pageerror', (error) => browserErrors.push(error.message))
  1439 |   await createCinematicProject(page)
  1440 | 
  1441 |   await openAddNodeAtBlank(page, '文本')
  1442 |   const textNode = page.getByRole('button', { name: '文本 01', exact: true })
  1443 |   const textPanel = page.getByRole('region', { name: '文本 01 文本参数' })
  1444 |   await expect(textPanel).toBeVisible()
  1445 |   await textPanel.getByRole('combobox', { name: '文本模型' }).selectOption('ark-text-llm')
  1446 |   await expect(textPanel.getByLabel('预计成本 1', { exact: true })).toBeVisible()
  1447 |   await textPanel.getByRole('textbox', { name: '文本生成提示词' }).fill('雨巷中的河灯旁白')
  1448 |   await textPanel.getByRole('button', { name: '生成文本，预计成本 1' }).click()
  1449 |   await expect(textPanel.getByRole('textbox', { name: '文本内容' })).toHaveValue(/\u96e8\u5df7\u4e2d\u7684\u6cb3\u706f\u65c1\u767d/)
  1450 |   await expect(textPanel.getByText('来源模型：豆包 Seed 2.1 Pro')).toBeVisible()
  1451 |   await expect(textPanel.getByRole('status')).toContainText('文本生成任务已提交')
  1452 |   await textPanel.getByRole('combobox', { name: '字体样式' }).selectOption('引用')
  1453 | 
  1454 |   await openAddNodeAtBlank(page, '脚本')
  1455 |   await expect(textPanel).toBeHidden()
  1456 |   await expect(page.getByRole('toolbar', { name: '文本快捷尝试' })).toBeVisible()
  1457 |   const scriptPanel = page.getByRole('region', { name: '脚本 01 脚本参数' })
  1458 |   await expect(scriptPanel.getByRole('list', { name: '章节列表' })).toBeVisible()
  1459 |   await scriptPanel.getByRole('textbox', { name: '剧情大纲' }).fill('雨夜重逢后追查失踪真相')
  1460 |   await scriptPanel.getByRole('spinbutton', { name: '场次数量' }).fill('2')
  1461 |   await scriptPanel.getByRole('button', { name: '生成脚本，预计成本 1' }).click()
  1462 |   await expect(scriptPanel.getByRole('list', { name: '章节列表' }).getByRole('listitem')).toHaveCount(2)
  1463 |   await expect(scriptPanel.getByText('来源模型：豆包 Seed 2.1 Pro')).toBeVisible()
  1464 |   await expect(scriptPanel.getByText(/共 \d+ 字/)).toBeVisible()
  1465 | 
  1466 |   await openAddNodeAtBlank(page, '音频')
  1467 |   const audioPanel = page.getByRole('region', { name: '音频 01 音频参数' })
  1468 |   await expect(audioPanel.getByText('00:12')).toBeVisible()
  1469 |   await audioPanel.getByRole('combobox', { name: '音频模型' }).selectOption('ark-audio-gen')
  1470 |   await expect(audioPanel.getByText('预计成本 12')).toBeVisible()
  1471 |   await expect(audioPanel.getByText('00:12')).toBeVisible()
  1472 |   await expect(audioPanel.getByRole('combobox', { name: '音色' })).toHaveValue('zh_female_vv_uranus_bigtts')
  1473 |   await audioPanel.getByRole('slider', { name: '语速' }).press('ArrowRight')
  1474 |   await audioPanel.getByRole('slider', { name: '语速' }).press('ArrowRight')
  1475 |   await expect(audioPanel.getByRole('slider', { name: '语速' })).toHaveValue('1.2')
  1476 |   await audioPanel.getByRole('slider', { name: '音量' }).press('ArrowRight')
  1477 |   await expect(audioPanel.getByRole('slider', { name: '音量' })).toHaveValue('51')
  1478 | 
  1479 |   await openAddNodeAtBlank(page, '导演台 NEW')
  1480 |   const directorPanel = page.getByRole('region', { name: '导演台 01 导演台参数' })
  1481 |   const shotList = directorPanel.getByRole('list', { name: '分镜编排列表' })
  1482 |   await expect(shotList.getByRole('listitem')).toHaveCount(2)
  1483 |   await expect(directorPanel.getByRole('img', { name: '导演台 01 3D视口' })).toBeVisible()
  1484 |   const directorObjectTree = directorPanel.getByRole('tree', { name: '3D对象树' })
  1485 |   await expect(directorObjectTree.getByRole('treeitem', { name: '人形素模 01 人形素模' })).toBeVisible()
> 1486 |   await directorPanel.getByRole('button', { name: '添加立方体' }).click()
       |                                                              ^ Error: locator.click: Test timeout of 30000ms exceeded.
  1487 |   await expect(directorObjectTree.getByRole('treeitem', { name: '立方体 01 立方体' })).toBeVisible()
  1488 |   await directorObjectTree.getByRole('textbox', { name: '立方体 01名称' }).fill('主场景方桌')
  1489 |   await directorPanel.getByRole('button', { name: '顶部视图' }).click()
  1490 |   await expect(directorPanel.getByRole('button', { name: '顶部视图' })).toHaveAttribute('aria-pressed', 'true')
  1491 |   await expect(directorPanel.getByRole('button', { name: '深度动作捕捉' })).toBeDisabled()
  1492 |   await expect(directorPanel).toContainText('待接入深度动作捕捉服务')
  1493 |   await directorPanel.getByRole('button', { name: '上移人物入画' }).click()
  1494 |   await directorPanel.getByRole('button', { name: '新增分镜' }).click()
  1495 |   await expect(shotList.getByRole('listitem')).toHaveCount(3)
  1496 |   await directorPanel.getByRole('button', { name: '导出四视图 PNG 到画布' }).click()
  1497 |   await expect(page.getByRole('button', { name: '导演台 01 四视图', exact: true })).toBeVisible()
  1498 |   await expect(page.getByText('导演台四视图 PNG 已生成图片节点并写入资产库。')).toBeVisible()
  1499 | 
  1500 |   await openAddNodeAtBlank(page, '逐帧拉片 本地分析')
  1501 |   const analysisPanel = page.getByRole('region', { name: '逐帧拉片 01 逐帧拉片参数' })
  1502 |   await expect(analysisPanel).toContainText('选择上游视频或上传视频')
  1503 |   await analysisPanel.getByRole('button', { name: '开始拉片' }).click()
  1504 |   const analysisConfirmation = page.getByRole('dialog', { name: '逐帧拉片分析' })
  1505 |   await expect(analysisConfirmation.getByRole('checkbox', { name: '音乐维度' })).toBeDisabled()
  1506 |   await expect(analysisConfirmation.getByRole('button', { name: '确认分析' })).toBeDisabled()
  1507 |   await analysisConfirmation.getByRole('button', { name: '取消' }).click()
  1508 | 
  1509 |   await openAddNodeAtBlank(page, '智能剪辑 Beta')
  1510 |   const smartEditPanel = page.getByRole('region', { name: '智能剪辑 01 智能剪辑参数' })
  1511 |   await expect(smartEditPanel.getByRole('list', { name: '剪辑轨道' }).getByRole('listitem')).toHaveCount(3)
  1512 |   await expect(smartEditPanel.getByRole('list', { name: '片段列表' }).getByRole('listitem')).toHaveCount(2)
  1513 |   await expect(smartEditPanel.getByRole('button', { name: '智能粗剪' })).toBeDisabled()
  1514 |   await expect(smartEditPanel.getByRole('button', { name: '智能混剪' })).toBeDisabled()
  1515 |   await smartEditPanel.getByRole('spinbutton', { name: '片段 02时长' }).fill('5')
  1516 |   await expect(smartEditPanel.getByText('导出时长 00:09')).toBeVisible()
  1517 | 
  1518 |   await expect(page.getByText('已保存')).toBeVisible()
  1519 |   await page.reload()
  1520 |   await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
  1521 |   await page.getByRole('button', { name: '适配画布' }).click()
  1522 |   await page.getByRole('button', { name: '文本 01', exact: true }).click()
  1523 |   const persistedText = page.getByRole('region', { name: '文本 01 文本参数' })
  1524 |   await expect(persistedText.getByRole('textbox', { name: '文本内容' })).toHaveValue(/\u96e8\u5df7\u4e2d\u7684\u6cb3\u706f\u65c1\u767d/)
  1525 |   await expect(persistedText.getByRole('combobox', { name: '字体样式' })).toHaveValue('引用')
  1526 |   await page.getByRole('button', { name: '适配画布' }).click()
  1527 |   await page.getByRole('button', { name: '导演台 01', exact: true }).click()
  1528 |   const persistedDirectorPanel = page.getByRole('region', { name: '导演台 01 导演台参数' })
  1529 |   await expect(persistedDirectorPanel.getByRole('treeitem', { name: '主场景方桌 立方体' })).toBeVisible()
  1530 |   await expect(persistedDirectorPanel.getByRole('button', { name: '顶部视图' })).toHaveAttribute('aria-pressed', 'true')
  1531 |   expect(browserErrors).toEqual([])
  1532 | })
  1533 | 
  1534 | test('writes and persists content directly inside a Liblib manual text node', async ({ page }) => {
  1535 |   await createCinematicProject(page)
  1536 |   await openAddNodeAtBlank(page, '文本')
  1537 | 
  1538 |   await page
  1539 |     .getByRole('toolbar', { name: '文本快捷尝试' })
  1540 |     .getByRole('button', { name: '自己编写内容' })
  1541 |     .click()
  1542 | 
  1543 |   const editor = page.getByRole('textbox', { name: '自己编写内容' })
  1544 |   const toolbar = page.getByRole('toolbar', { name: '文本格式工具' })
  1545 |   await expect(editor).toBeVisible()
  1546 |   await expect(toolbar).toBeVisible()
  1547 |   await editor.fill('一个来自未来的机器人，在城市屋顶看星星。')
  1548 |   await toolbar.getByRole('button', { name: '一级标题' }).click()
  1549 |   await toolbar.getByRole('button', { name: '加粗' }).click()
  1550 |   await toolbar.getByRole('button', { name: '展开文本节点' }).click()
  1551 |   await expect(toolbar.getByRole('button', { name: '收起文本节点' })).toHaveAttribute('aria-pressed', 'true')
  1552 | 
  1553 |   await page.reload()
  1554 |   await page.getByRole('textbox', { name: '自己编写内容' }).click()
  1555 |   const persistedToolbar = page.getByRole('toolbar', { name: '文本格式工具' })
  1556 |   await expect(page.getByRole('textbox', { name: '自己编写内容' })).toHaveValue('一个来自未来的机器人，在城市屋顶看星星。')
  1557 |   await expect(persistedToolbar.getByRole('button', { name: '一级标题' })).toHaveAttribute('aria-pressed', 'true')
  1558 |   await expect(persistedToolbar.getByRole('button', { name: '加粗' })).toHaveAttribute('aria-pressed', 'true')
  1559 | })
  1560 | 
  1561 | test('creates a connected Liblib text-to-video preset from the text node shortcut', async ({ page }) => {
  1562 |   await createCinematicProject(page)
  1563 |   await openAddNodeAtBlank(page, '文本')
  1564 |   const initialEdgeCount = await page.locator('.react-flow__edge').count()
  1565 | 
  1566 |   await page
  1567 |     .getByRole('toolbar', { name: '文本快捷尝试' })
  1568 |     .getByRole('button', { name: '文生视频' })
  1569 |     .click()
  1570 | 
  1571 |   await expect(page.getByRole('group', { name: '节点分组：预设 - 文生视频' })).toBeVisible()
  1572 |   await expect(page.getByRole('textbox', { name: '自己编写内容' })).toBeVisible()
  1573 |   const videoPanel = page.getByRole('region', { name: '视频 01 生成参数' })
  1574 |   await expect(videoPanel).toBeVisible()
  1575 |   await expect(videoPanel.getByRole('combobox', { name: '生成模式' })).toHaveValue('文生视频')
  1576 |   await expect(videoPanel.getByRole('textbox', { name: '提示词' })).toHaveValue(
  1577 |     '根据文字描述生成视频。',
  1578 |   )
  1579 |   await expect(page.locator('.react-flow__edge')).toHaveCount(initialEdgeCount + 1)
  1580 | })
  1581 | 
  1582 | test('shows only real image and video models with their supported parameters', async ({ page }) => {
  1583 |   await createCinematicProject(page)
  1584 |   await openAddNodeAtBlank(page, '图片')
  1585 |   const imagePanel = page.getByRole('region', { name: '图片 01 生成参数' })
  1586 |   const imageModel = imagePanel.getByRole('combobox', { name: '图片模型' })
```