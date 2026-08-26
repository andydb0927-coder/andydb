# 模型 Manifest 接入指南（零 UI 改动）

## 1. 目标与边界

图片/视频/文本/音频模型的参数能力由 Provider manifest 声明，节点 UI 只消费统一合同，不识别供应商 ID 或模型名称。新增模型时不得在 `ImageNodeDetails.tsx`、`VideoNodeDetails.tsx` 中增加模型特判。

核心文件：

- `app/src/features/generation/model-parameter-semantics.ts`：参数名、标准语义集和 manifest 编译器；
- `app/src/features/generation/image-size-resolver.ts`：通用尺寸计算、约束和自定义校验；
- `app/src/features/generation/model-provider-registry.ts`：`ModelProvider` 合同、成本计算、Demo manifest 工厂和注册表；
- 各真实 Provider：只声明参数 manifest/策略，并在适配器内部映射官方 API 字段。

## 2. 参数语义模板

以下参数可以直接写 `true` 复用标准集，也可以用 `{ semantic: true, ...覆盖项 }` 收窄：

| 参数 | 标准默认值 | 标准选项 |
| --- | --- | --- |
| `aspectRatio` | `16:9` | `1:1`、`1:2`、`2:1`、`9:16`、`16:9`、`3:4`、`4:3`、`3:2`、`2:3`、`5:4`、`4:5`、`21:9`、`9:21` |
| `resolution` | `2K` | `1K`、`1.5K`、`2K` |
| `count` | `1` | `1`、`2`、`4` |

其他参数继续使用完整声明：

- 枚举：`{ type: 'enum', defaultValue, options }`；
- 布尔：`{ type: 'boolean', defaultValue }`；
- 数字：`{ type: 'number', defaultValue, min, max, step }`。

示例：

```ts
parameters: {
  aspectRatio: true,
  resolution: { semantic: true, options: ['1K', '2K'], defaultValue: '2K' },
  count: { semantic: true, options: ['1', '4'], defaultValue: '1' },
  editStrength: { type: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.05 },
}
```

注册后 `resolveModelParameterManifest()` 会生成旧代码兼容的 `parameterSchema`。UI、默认值归一化和可访问名称仍读取 `parameterSchema`，因此旧测试契约不变。

## 3. `sizePolicy` 字段

只有需要计算真实图片尺寸的模型声明 `sizePolicy`；视频/文本/音频可以省略。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `aspectOptions` | `readonly string[]` | 该模型实际支持的比例；可额外包含 `自适应`、`自定义` |
| `resolutionTiers` | `ImageResolutionTier[]` | 档位 ID、方形基准边长、API 值及官方精确比例映射 |
| `pixelConstraints` | object | `minTotalPixels`、`maxTotalPixels`、`minRatio`、`maxRatio` |
| `multiImageStrategy` | `single \| serial \| batch` | 单图、客户端串行 N 次、一次请求批量 N 张 |
| `costMode` | object | `{ amount, per: 'generation' \| 'image' }`；UI 与队列共用同一成本语义 |

`ImageSizeResolver` 的行为：

1. 优先读取档位里的 `exactSizes[比例]`；
2. 没有官方精确值时，根据 `squareEdge` 和宽高比计算；
3. 超过总像素上限时按原比例收缩并对齐到 8 像素；
4. `自定义` 在发请求前按像素总量和宽高比校验；
5. 返回 `apiValue`、UI `label`、最终 `width/height` 和模式。

## 4. 新增 Demo 图片模型完整示例

下例只增加 manifest 与 fixture，不修改任何节点 UI：

```ts
import { createDemoProviderFromManifest } from './model-provider-registry'
import { standardImageAspectRatios } from './model-parameter-semantics'

const provider = createDemoProviderFromManifest({
  id: 'mock-new-image',
  name: 'Demo Studio',
  modelName: 'New Image',
  capabilities: ['text-to-image', 'image-to-image'],
  parameters: {
    aspectRatio: {
      semantic: true,
      options: [...standardImageAspectRatios, '自适应', '自定义'],
    },
    resolution: true,
    count: true,
    customWidth: { type: 'number', defaultValue: 2048, min: 1, max: 10000, step: 1 },
    customHeight: { type: 'number', defaultValue: 2048, min: 1, max: 10000, step: 1 },
  },
  sizePolicy: {
    aspectOptions: [...standardImageAspectRatios, '自适应', '自定义'],
    resolutionTiers: [
      { id: '1K', squareEdge: 1024 },
      { id: '1.5K', squareEdge: 1536 },
      { id: '2K', squareEdge: 2048, exactSizes: { '16:9': [2816, 1584] } },
    ],
    pixelConstraints: {
      minTotalPixels: 921600,
      maxTotalPixels: 4624220,
      minRatio: 1 / 16,
      maxRatio: 16,
    },
    multiImageStrategy: 'batch',
    costMode: { amount: 7, per: 'image' },
  },
  pricing: { amount: 7, currency: 'credits', unit: 'generation' },
  officialApiEndpoint: 'mock://local/new-image',
  fixture: { imageUrl: '/demo/shot-river.png' },
})
```

注册该 Provider 后会自动得到：模型选项、比例/清晰度/数量参数面板、实际像素摘要、按张总成本、生成资格校验、完整多结果合同和 2×2 结果网格。

## 5. 真实 Provider 接入清单

1. 用 `ModelParameterManifest` 声明 UI 参数；不要手写 UI 分支。
2. 若为图片模型，按官方文档填写 `ImageSizePolicy`，不得伪造画质、数量或尺寸能力。
3. 用 `resolveModelParameterManifest(manifest)` 填充 Provider 的 `parameterSchema`，同时保留原始 `parameterManifest`。
4. 请求适配器使用 `new ImageSizeResolver(sizePolicy).resolve(request.parameters).apiValue` 映射 API 尺寸。
5. 成本统一调用 `providerGenerationCost()`；不得在节点组件里自行乘数量。
6. 多图结果返回 `asset`（主图）和有序 `assets`（完整集合）；`asset === assets[0]`。
7. 先写 provider 合同测试、manifest 验收测试和网络 fixture；测试不得调用真实 API。
8. 跑 `typecheck + Vitest + build + Playwright` 后才能注册为可见模型。

## 6. 兼容性规则

- `parameterSchema` 仍是运行时稳定合同，现有组件和持久化数据无需迁移；
- 没有 `sizePolicy` 的旧模型继续显示原比例文案，不强行改变既有 UI；
- 有 `sizePolicy` 的模型自动显示实际 `WxH`，自适应显示档位；
- `pricing` 保留通用/视频计费兼容，图片策略存在时以 `sizePolicy.costMode` 为唯一成本来源；
- Provider 的 `kind` 只控制演示/占位/真实状态，不参与尺寸或参数特判。
