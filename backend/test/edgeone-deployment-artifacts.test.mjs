import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readBackendFile(path) {
  return readFileSync(resolve(backendRoot, path), 'utf8')
}

function environmentKeys(source) {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.slice(0, line.indexOf('=')))
}

describe('EdgeOne 中国内地预部署产物', () => {
  it('提供固定的单文件 EdgeOne 构建命令', () => {
    const packageJson = JSON.parse(readBackendFile('package.json'))

    expect(packageJson.scripts?.['build:edgeone']).toBe(
      'esbuild src/index.ts --bundle --format=esm --platform=browser --target=es2022 --outfile=dist/index.js',
    )
    expect(packageJson.devDependencies?.esbuild).toBeTruthy()
  })

  it('提供不含真实凭据的 EdgeOne 环境变量模板', () => {
    const template = readBackendFile('.env.edgeone.example')
    const expectedKeys = [
      'DEVICE_TOKEN_SECRET',
      'ADMIN_TOKEN',
      'ARK_API_KEY',
      'OPENSPEECH_API_KEY',
      'ARK_API_BASE',
      'OPENSPEECH_API_BASE',
      'SEEDREAM_MODEL_ID',
      'SEEDANCE_MODEL_ID',
      'ARK_TEXT_MODEL_ID',
      'OPENSPEECH_RESOURCE_ID',
      'CORS_ALLOWED_ORIGINS',
      'DEVICE_TOKEN_TTL_SECONDS',
      'UPSTREAM_TIMEOUT_MS',
      'SNAPSHOT_KV_THRESHOLD_BYTES',
      'INVITE_CODES',
    ]

    expect(environmentKeys(template)).toEqual(expectedKeys)
    expect(template).toMatch(/^DEVICE_TOKEN_SECRET=$/m)
    expect(template).toMatch(/^ADMIN_TOKEN=$/m)
    expect(template).toMatch(/^ARK_API_KEY=$/m)
    expect(template).toMatch(/^OPENSPEECH_API_KEY=$/m)
    expect(template).not.toMatch(/replace-with|sk-|AKLT|Bearer\s+[A-Za-z0-9]/i)
  })

  it('国内部署手册覆盖备案、绑定、触发、灰度和回滚', () => {
    const guide = readBackendFile('docs/edgeone-deploy-cn.md')

    for (const heading of [
      '开通 EdgeOne',
      '创建中国内地边缘函数',
      '绑定 EdgeKV',
      '环境变量与 Secret',
      '关联已备案域名',
      '配置 `/api/*` 触发规则',
      '灰度发布与验收',
      '回滚',
    ]) {
      expect(guide).toContain(heading)
    }
    expect(guide).toContain('EDGEKV')
    expect(guide).toContain('最终一致')
    expect(guide).toContain('https://cloud.tencent.com/document/product/1552/104964')
    expect(guide).toContain('https://cloud.tencent.com/document/product/1552/130379')
  })

  it('灰度脚本可执行、输出中文 PASS/FAIL 且不触发真实生成', () => {
    const scriptPath = resolve(backendRoot, 'scripts/verify-edgeone-cn.sh')
    const script = readFileSync(scriptPath, 'utf8')

    expect(statSync(scriptPath).mode & 0o111).not.toBe(0)
    expect(script).toContain('PASS')
    expect(script).toContain('FAIL')
    expect(script).toContain('/api/health')
    expect(script).toContain('/api/data/projects')
    expect(script).not.toContain('/api/proxy/')
  })

  it('README 明确三环境支持矩阵和 EdgeOne 目标', () => {
    const readme = readBackendFile('README.md')

    expect(readme).toContain('三环境矩阵')
    expect(readme).toContain('本地 dev 直连')
    expect(readme).toContain('Cloudflare Workers（已弃用）')
    expect(readme).toContain('EdgeOne 中国内地（目标）')
    expect(readme).toContain('npm run build:edgeone')
  })
})
