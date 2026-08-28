# 导演台增强（批次7）

## 范围与契约

- 起点：`01d29140187bffa2b2e3e192c166d27744fe7663`，分支 `codex/platform-shell-phase`。不修改已有三张用户截图，不调用真实生成 API。
- 保留对象树、基础几何、人形素模、OrbitControls、透视/正交、四视图导出及可访问名称。
- 三点布光 / 侧逆光 / 顶光 / 轮廓光使用真实方向光。视口灯光手柄拖动定位，XYZ 数值输入提供精确、键盘可达的替代；拖拽结束写入节点。
- 特写 / 中景 / 全景 / 低角度保存相机位置、朝向目标和焦距，约 600ms 过渡；系统减少动态效果时直接切换。
- 桌子 / 椅子 / 树 / 柱体为程序化几何组合，支持资产面板拖入地面投影位置，也支持按钮添加；无下载外部模型、无生成费用。
- 运镜为本地位置关键帧的等时线性插值，朝向目标与焦距沿用保存机位。支持添加、改坐标、删除、时长、播放、停止；播放结束/停止恢复保存机位，不产生项目写入。真实 AI 运镜仍单独明确占位。
- 新增当前场景快照 PNG，复用四视图的图片节点 + 资产入库路径；图片均为 1280×720。导出期间防重复并清理辅助灯光手柄，失败显示原因。

## 数据与实现边界

`Director3DSceneState` 追加可选 `lighting`、`trajectory`；相机追加可选 `preset`、`focalLength`。旧场景无新字段时沿用旧光源与 46° 镜头，无数据库版本升级，不清数据。旧 `details.trajectory.points` 在界面读取时兼容，编辑写入场景的新字段。

纯数据模块负责预设、校验、不可变变更与插值；Three 渲染模块负责场景构建/资源释放；runtime 管理稳定的 WebGL 生命周期、动画、拖拽与 PNG；React 负责控件和持久化回调。Agent/生成队列不参与。

Three.js 官方参考：[相机焦距](https://threejs.org/docs/pages/PerspectiveCamera.html)、[三维对象变换与场景图](https://threejs.org/docs/pages/TransformControls.html)。本实现使用相机平面的射线求交拖动灯光，避免拖动时触发 OrbitControls。

## TDD 与验收

先失败测试：四类布光独立数据、拖动坐标校验、四类机位与插值、程序化资产、轨迹边界/旧状态兼容、无 WebGL 时可编辑但预览禁用、快照入库。

浏览器：真实 WebGL 渲染、灯光拖动、机位过渡、资产拖入、轨迹播放/停止、刷新恢复、PNG 入库/尺寸；721px 控件可达；所有 API 网络拦截。门禁顺序：typecheck → test:run → build:mock → PLAYWRIGHT_OFFLINE_DIST=dist playwright。不删除基线测试。
