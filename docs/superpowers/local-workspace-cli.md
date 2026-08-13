# 本地工作区 CLI 兼容层

## 运行边界

该兼容层随 Vite dev/preview server 运行，命名空间是 `wireless-canvas.workspace`。它不调用 `libtv` 二进制，不访问外部网络，不读取浏览器 IndexedDB，也不写磁盘。调用方必须把项目或时间线作为显式 JSON 输入传入；“导入”命令只校验，不持久化。

可机器读取的导出清单：

```text
GET /api/workspace/manifest
```

`/agents` 会通过同源请求只读检测该 manifest：桥接可用时展示命令 id 与说明，不可用或响应不符合版本化契约时只显示固定的安全降级文案。该状态面板不会执行命令，也不会把浏览器项目数据发送给 server。纯静态托管下显示“当前构建未启用本地 CLI 桥接”属于预期行为。

统一执行入口：

```text
POST /api/workspace/execute
Content-Type: application/json
```

请求 envelope：

```json
{
  "schemaVersion": 1,
  "command": "workspace.project.export",
  "input": { "project": {} }
}
```

成功 envelope：

```json
{
  "schemaVersion": 1,
  "data": {
    "command": "workspace.project.export",
    "output": {
      "filename": "项目名-项目.json",
      "mimeType": "application/json",
      "encoding": "utf-8",
      "content": "..."
    }
  }
}
```

失败 envelope：

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "SCHEMA_VALIDATION_FAILED",
    "message": "project 结构无效"
  }
}
```

## 命令清单

| 命令 | 输入 | 输出 | 副作用 |
| --- | --- | --- | --- |
| `workspace.project.export` | `{ project }` | `wireless-canvas-project@1` JSON 文件 | 无 |
| `workspace.project.import.validate` | `{ content }` | 项目 id、标题、节点/素材数量 | 仅解析与校验 |
| `workspace.assets.manifest` | `{ project }` | `wireless-canvas-assets@1` JSON 文件，含节点引用关系 | 无 |
| `workspace.timeline.edl` | `{ timeline }` | UTF-8 EDL 文件 | 无 |

manifest 中每个命令都包含稳定的 `inputSchemaId`、`outputSchemaId`、方法、路径和文件格式。新增字段必须通过新的 schema 版本演进，不能静默改变 `@1` 语义。

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `INVALID_CONTENT_LENGTH` | Content-Length 不是非负十进制整数 |
| 400 | `INVALID_JSON` | 请求体不是合法 JSON |
| 400 | `SCHEMA_VALIDATION_FAILED` | envelope 或命令输入不符合 schema |
| 404 | `UNKNOWN_COMMAND` | 未注册命令 |
| 405 | `METHOD_NOT_ALLOWED` | 路径存在但方法错误 |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体超过 1 MiB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 不是 JSON Content-Type |
| 500 | `INTERNAL_ERROR` | 未预期的本地执行错误 |

## curl 示例

```bash
curl -s http://localhost:5173/api/workspace/manifest
```

执行命令时，先由浏览器或调用方导出当前项目对象，再把它放到 `input.project`。兼容层不会尝试绕过浏览器数据边界直接读取项目。
