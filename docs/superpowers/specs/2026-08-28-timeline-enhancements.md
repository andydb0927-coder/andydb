# 时间线增强批次6

起点：`c021a957`；保留既有时间线 schemaVersion=1、JSON/EDL 和手动预览录制。新增字段可选，旧项目无需迁移或清库。

## 交互及数据契约

- 转场存于后一个视觉片段 `transitionIn`，类型 fade / dissolve / black，时长秒。仅同轨相邻且连续片段生效，时长限制为两个片段中较短者。不移动剪辑点、不缩短总时长，字幕和配乐无需跟随重排。交叉溶解在入片段开始处由前片段末帧淡至新片段；淡入淡出在剪辑点两侧各占一半；黑场在中间保留短暂全黑。预览与导出共用帧规划。
- 字幕存为独立 subtitle clip，支持开始/结束、文本、字号、颜色、背景、顶部/中部/底部、粗体。字幕按时间生效，换行和样式由同一 canvas 绘制函数烧录；JSON 保留全部编辑数据。
- 多条 audio track，可将片段指定到轨道并设置时间起点；统一时间刻度展示。`volumeKeyframes[{timeSeconds,value}]` 以片段播放后的局部秒计，线性插值、边界钳制，音量 0–1；预览所有活跃音轨同时播放，导出 Web Audio 混流。视频原声不隐式混入，需显式抽取到音频轨，避免重复配音。
- 导出新增“导出合成视频”，当前快照在独立 canvas 中按固定时间戳逐帧绘制，经 WebCodecs 编码并由 Mediabunny 封装 WebM（不冒充 MP4）。字幕烧录、多轨离线混音、画中画/变速/转场生效。每帧等待编码背压，不以墙上时钟丢帧追赶进度，最终帧数与提交帧数一致才允许下载。显示素材准备/合成/封装进度及取消。禁止重复启动；取消/卸载终止输出，释放媒体、编码器及对象URL，不下载残缺文件；加载/跨域/解码失败明确反馈，不跳过坏素材生成假成功。
- 本批不调用任何生成API；不更改生成provider、用户资产、其他画布数据。纯本地导出无积分费用。

## TDD 与验收

1. 纯函数失败测试：转场采样、时长边界、字幕样式校验、包络线性插值、音轨对齐、拆分与变速兼容、JSON/IndexedDB往返。
2. 组件失败测试：编辑参数与样式、同播音轨、导出进度/取消/异常/卸载，保留既有可访问名称。
3. fixture E2E：编辑→刷新、转场画面像素/字幕、两轨混音导出可解码、取消无下载；窄视口可达。独立浏览器数据，无真实API。
4. 门禁顺序 typecheck → test:run → build:mock → PLAYWRIGHT_OFFLINE_DIST=dist playwright；保存原始计数/日志，保留用户三张在途截图。全绿再提交推送。

## 浏览器实现依据

- [Mediabunny media sources](https://mediabunny.dev/guide/media-sources)：CanvasSource 用显式时间戳与帧时长提交，等待 add 的编码背压；AudioBufferSource 接收离线混音结果。
- [Mediabunny Output](https://mediabunny.dev/api/Output)：BufferTarget + WebMOutputFormat 本地封装，finalize 完成后下载，cancel 清理未完成输出。
- [AudioBufferSourceNode.start](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start)：时间偏移与片段源时长独立于播放倍速，包络时间使用合成时间轴。

实现阶段发现：实时 MediaRecorder 在并发负载下，4秒成片只录入约2.17秒的视频帧，而音轨接近4秒。因此正式导出改为时间戳驱动的 WebCodecs + OfflineAudioContext，新增尾帧解码回归。原手动预览录制独立保留，不作为本次合成导出的实现。

## 边界与恢复

- 按时间线尺寸和帧率合成（默认1920×1080、24fps），VP8画面 + Opus音频输出 WebM；需要支持相应 WebCodecs 编码器的浏览器。长片受离线音频缓冲区/输出缓冲区内存与编码性能影响，未进行长片专项基准。保留 JSON/EDL，EDL仍为基础剪辑决策格式，完整转场/字幕/包络以JSON为准。
- 变速同步缩放音量关键帧时间，分割/裁剪重算包络边界；显式音频对齐起点不被后续编辑偷偷重排。
- IndexedDB写入失败有中文提示与“重试保存时间线”；当前编辑快照保留，不能把保存失败当作成功。
