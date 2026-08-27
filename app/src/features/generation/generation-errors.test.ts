import { describe, expect, test, vi } from 'vitest'

import {
  GenerationServiceError,
  assertProviderResponse,
  fetchProviderResponse,
  generationErrorMessage,
  imageAnalysisFailureDetail,
  mapToolGenerationError,
  libtvBridgeErrorMessage,
  readProviderJson,
  safeProviderMessage,
  type GenerationService,
} from './generation-errors'

describe('集中安全错误契约', () => {
  test.each([
    ['seedream', 400, 'Seedream 请求参数无效（400）', 'invalid-request'],
    ['seedream', 401, 'Seedream 鉴权失败（401）', 'unauthorized'],
    ['seedream', 403, 'Seedream 访问被拒绝（403）', 'forbidden'],
    ['seedream', 429, 'Seedream 请求过于频繁或额度不足（429）', 'rate-limited'],
    ['seedream', 503, 'Seedream 请求失败（503）', 'http-error'],
    ['seedance', 401, '火山方舟 Seedance 鉴权失败（401）', 'unauthorized'],
    ['seedance', 429, '火山方舟 Seedance 请求过于频繁（429）', 'rate-limited'],
    ['ark-text', 403, '火山方舟文本模型无访问权限（403）', 'forbidden'],
    ['ark-text', 429, '火山方舟文本生成请求过于频繁（429）', 'rate-limited'],
    ['ark-text', 503, '火山方舟文本生成服务暂不可用（503）', 'http-error'],
    ['ark-tts', 401, '豆包语音合成鉴权失败（401）', 'unauthorized'],
    ['ark-audio', 503, '豆包音频生成服务暂不可用（503）', 'http-error'],
  ] as const)('%s HTTP %s 保留原文案且不回显上游正文', async (service, status, message, code) => {
    const response = Response.json({ error: { message: 'Authorization: Bearer fixture-private-key' } }, { status })
    await expect(assertProviderResponse(response, service)).rejects.toMatchObject({ message, code, status })
  })

  test.each([
    ['InputTextSensitiveContentDetected', '提示词'],
    ['InputImageSensitiveContentDetected', '参考图片'],
    ['OutputImageSensitiveContentDetected', '生成结果'],
  ])('集中处理Seedream业务错误码 %s', async (code, target) => {
    await expect(assertProviderResponse(Response.json({ error: { code } }, { status: 400 }), 'seedream'))
      .rejects.toThrow(`Seedream ${target}未通过安全检查（400）`)
  })

  test('错误正文不可解析仍返回参数错误，成功正文不被预读', async () => {
    const response = new Response('invalid upstream', { status: 400 })
    await expect(assertProviderResponse(response, 'seedream')).rejects.toMatchObject({ code: 'invalid-request', message: 'Seedream 请求参数无效（400）' })
    const success = Response.json({ data: [1] })
    await assertProviderResponse(success, 'seedream')
    expect(success.bodyUsed).toBe(false)
    expect(await success.json()).toEqual({ data: [1] })
  })

  test.each(['seedream', 'seedance', 'ark-text', 'ark-tts', 'ark-audio'] as const)('%s网络异常安全化且不吞原始cause', async (service: GenerationService) => {
    const cause = new TypeError('request failed Authorization: Bearer fixture-private-key https://private.invalid/?token=private')
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(cause)
    const result = fetchProviderResponse(fetchFn, service, 'https://fixture.invalid', { method: 'POST' })
    await expect(result).rejects.toMatchObject({ code: 'network', cause })
    await expect(result).rejects.toThrow('网络异常')
    await result.catch((error: unknown) => {
      expect(error).toBeInstanceOf(GenerationServiceError)
      expect(generationErrorMessage(error)).not.toContain('private')
      expect(JSON.stringify(error)).not.toContain('private')
    })
  })

  test('保留AbortError身份；正常响应、请求和signal不被改写', async () => {
    const controller = new AbortController()
    const error = new DOMException('cancelled', 'AbortError')
    await expect(fetchProviderResponse(vi.fn<typeof fetch>().mockRejectedValue(error), 'seedance', '/fixture'))
      .rejects.toBe(error)
    const response = Response.json({ ok: true })
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response)
    const init = { method: 'POST', body: '{"prompt":"fixture"}', signal: controller.signal }
    expect(await fetchProviderResponse(fetchFn, 'seedream', '/fixture', init)).toBe(response)
    expect(fetchFn).toHaveBeenCalledExactlyOnceWith('/fixture', init)
  })

  test('解析错误仅显示产品文案，cause非枚举且取消不变成解析错误', async () => {
    const response = new Response('private response')
    const result = readProviderJson(response, 'Seedream 响应格式异常')
    await expect(result).rejects.toMatchObject({ message: 'Seedream 响应格式异常', cause: expect.any(SyntaxError) })
    const aborted = new DOMException('cancelled', 'AbortError')
    const unreadable = new Response()
    vi.spyOn(unreadable, 'json').mockRejectedValue(aborted)
    await expect(readProviderJson(unreadable, '响应格式异常')).rejects.toBe(aborted)
  })

  test('仅保留无凭据的上游短说明，队列未知异常提供中文兜底', () => {
    expect(safeProviderMessage(' fixture content rejected ')).toBe('fixture content rejected')
    expect(safeProviderMessage('x'.repeat(200))).toHaveLength(160)
    expect(safeProviderMessage('Authorization: Bearer fixture-private')).toBe('任务未完成')
    expect(safeProviderMessage('失败 https://private.invalid/?api_key=fixture-private')).toBe('任务未完成')
    expect(generationErrorMessage({ secret: 'private' })).toBe('生成失败，请稍后重试。')
    expect(generationErrorMessage(new Error('api_key=private'))).not.toContain('private')
    expect(generationErrorMessage(new Error('合法本地错误'))).toBe('合法本地错误')
    expect(generationErrorMessage(new Error('本地恢复说明'.repeat(40)))).toBe('本地恢复说明'.repeat(40))
  })

  test('委托工具复用错误映射且保留原中文与超时/部分结果语义', async () => {
    let error: unknown
    try { await assertProviderResponse(new Response(null, { status: 401 }), 'ark-text') } catch (cause) { error = cause }
    expect(mapToolGenerationError(error, 'subject-extraction').message).toBe('主体提取鉴权失败（401）')
    expect(mapToolGenerationError(error, 'frame-analysis').message).toBe('拉片分析鉴权失败（401）')
    expect(mapToolGenerationError(new Error('private'), 'video-continue', true).message).toContain('远程任务可能仍在运行')
    expect(mapToolGenerationError(new Error('Seedream 鉴权失败（401） Bearer private'), 'image-edit').message).not.toContain('private')
    expect(imageAnalysisFailureDetail(new Error('Seedream 请求失败（503）'))).toBe('请求失败（503）')
    expect(imageAnalysisFailureDetail(new Error('Seedream api_key=private'))).toBe('请求异常，请检查网络和模型权限。')
  })

  test('LibTV桥接业务错误码使用集中白名单，未知码不回显', () => {
    expect(libtvBridgeErrorMessage('WRITES_DISABLED')).toBe('LibTV 写入未启用，请在画布的模型设置中检查写入门禁。')
    expect(libtvBridgeErrorMessage('PAYLOAD_TOO_LARGE')).toBe('LibTV 生成请求过大，请减少参考素材后重试。')
    expect(libtvBridgeErrorMessage('INVALID_JSON')).toBe(libtvBridgeErrorMessage('UNSUPPORTED_MEDIA_TYPE'))
    expect(libtvBridgeErrorMessage('api_key=private')).toBe('LibTV 生成请求失败，请检查本地桥接状态后重试。')
    expect(libtvBridgeErrorMessage('constructor')).toBe(libtvBridgeErrorMessage(undefined))
  })
})
