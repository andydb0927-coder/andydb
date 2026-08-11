import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  LibTvCatalog,
  LibTvProviderSelection,
} from '../../src/features/generation/libtv-contract.js'
import { LIBTV_PROJECT_UUID_PATTERN } from '../../src/features/generation/libtv-contract.js'
import type { CliRunner, LibTvGeneratedAsset } from './types.js'

const MAX_PROMPT_LENGTH = 8_000
const MAX_REFERENCES = 3
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024

const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
} as const

type ReferenceKind = 'image' | 'video' | 'audio'
type TargetKind = 'image' | 'video'

interface ValidReference {
  bytes: Buffer
  extension: string
  kind: ReferenceKind
}

interface ValidGeneration {
  selection: LibTvProviderSelection
  targetKind: TargetKind
  prompt: string
  references: ValidReference[]
  videoMode?: 'text2video' | 'singleImage2video' | 'video2video'
}

interface GenerationFileSystem {
  mkdtemp: typeof mkdtemp
  writeFile: typeof writeFile
  rm: typeof rm
}

type ExecuteLibTvGeneration = (
  input: unknown,
  catalog: LibTvCatalog,
  runner: CliRunner,
  fileWorkspace: string,
) => Promise<LibTvGeneratedAsset>

export const executeLibTvGeneration: ExecuteLibTvGeneration =
  createLibTvGenerationExecutor({ mkdtemp, writeFile, rm })

export function createLibTvGenerationExecutor(
  fileSystem: GenerationFileSystem,
): ExecuteLibTvGeneration {
  return (input, catalog, runner, fileWorkspace) =>
    executeLibTvGenerationWithFileSystem(input, catalog, runner, fileWorkspace, fileSystem)
}

async function executeLibTvGenerationWithFileSystem(
  input: unknown,
  catalog: LibTvCatalog,
  runner: CliRunner,
  fileWorkspace: string,
  fileSystem: GenerationFileSystem,
): Promise<LibTvGeneratedAsset> {
  const generation = preflight(input, catalog)
  let temporaryDirectory: string | undefined
  let nodeStdout: string

  try {
    const referenceNames: string[] = []
    if (generation.references.length > 0) {
      temporaryDirectory = await fileSystem.mkdtemp(join(fileWorkspace, 'libtv-generation-'))
      for (const [index, reference] of generation.references.entries()) {
        const referenceName = `generation-reference-${index + 1}`
        const filePath = join(temporaryDirectory, `${referenceName}.${reference.extension}`)
        await fileSystem.writeFile(filePath, reference.bytes)
        await runner.run([
          'upload',
          referenceName,
          '-p',
          generation.selection.projectUuid,
          '-f',
          filePath,
          '-t',
          reference.kind,
        ])
        referenceNames.push(referenceName)
      }
    }

    const nodeResult = await runner.run(createNodeArguments(generation, referenceNames))
    nodeStdout = nodeResult.stdout
  } catch {
    throw new Error('LibTV generation failed')
  } finally {
    if (temporaryDirectory) {
      await removeTemporaryDirectory(fileSystem, temporaryDirectory)
    }
  }

  return parseGeneratedAsset(nodeStdout, generation.targetKind)
}

async function removeTemporaryDirectory(
  fileSystem: GenerationFileSystem,
  temporaryDirectory: string,
): Promise<void> {
  try {
    await fileSystem.rm(temporaryDirectory, { recursive: true, force: true })
    return
  } catch {
    // One immediate retry covers transient file-handle races without an unbounded loop.
  }

  try {
    await fileSystem.rm(temporaryDirectory, { recursive: true, force: true })
  } catch {
    throw new Error('LibTV temporary file cleanup failed')
  }
}

function preflight(input: unknown, catalog: LibTvCatalog): ValidGeneration {
  if (!isRecord(input) || input.confirmed !== true) {
    invalidRequest()
  }
  if (!catalog.authenticated || !catalog.writesEnabled) {
    invalidRequest()
  }

  const selection = parseSelection(input.selection)
  if (
    !LIBTV_PROJECT_UUID_PATTERN.test(selection.projectUuid) ||
    !catalog.projects.some((project) => project.uuid === selection.projectUuid) ||
    !catalog.imageModels.some((model) => model.modelName === selection.imageModelName) ||
    !catalog.videoModels.some((model) => model.modelName === selection.videoModelName)
  ) {
    invalidRequest()
  }

  const request = input.request
  if (!isRecord(request) || !isTargetKind(request.targetKind) || typeof request.prompt !== 'string') {
    invalidRequest()
  }
  if (request.prompt.trim().length === 0 || request.prompt.length > MAX_PROMPT_LENGTH) {
    invalidRequest()
  }
  if (!Array.isArray(request.referenceAssets) || request.referenceAssets.length > MAX_REFERENCES) {
    invalidRequest()
  }

  const references = request.referenceAssets.map(parseReference)
  const videoMode = validateReferenceCombination(request.targetKind, references)

  return {
    selection,
    targetKind: request.targetKind,
    prompt: request.prompt,
    references,
    ...(videoMode ? { videoMode } : {}),
  }
}

function parseSelection(value: unknown): LibTvProviderSelection {
  if (
    !isRecord(value) ||
    typeof value.projectUuid !== 'string' ||
    typeof value.projectName !== 'string' ||
    typeof value.imageModelName !== 'string' ||
    typeof value.videoModelName !== 'string'
  ) {
    invalidRequest()
  }
  return {
    projectUuid: value.projectUuid,
    projectName: value.projectName,
    imageModelName: value.imageModelName,
    videoModelName: value.videoModelName,
  }
}

function parseReference(value: unknown): ValidReference {
  if (
    !isRecord(value) ||
    !isReferenceKind(value.kind) ||
    typeof value.mimeType !== 'string' ||
    typeof value.dataUrl !== 'string'
  ) {
    invalidRequest()
  }

  const extension = MIME_EXTENSIONS[value.mimeType as keyof typeof MIME_EXTENSIONS]
  if (!extension || !value.mimeType.startsWith(`${value.kind}/`)) {
    invalidRequest()
  }

  const prefix = `data:${value.mimeType};base64,`
  if (!value.dataUrl.startsWith(prefix)) {
    invalidRequest()
  }
  const encoded = value.dataUrl.slice(prefix.length)
  if (!isBase64(encoded)) {
    invalidRequest()
  }

  const bytes = Buffer.from(encoded, 'base64')
  if (
    bytes.byteLength > MAX_REFERENCE_BYTES ||
    !hasExpectedReferenceSignature(bytes, value.mimeType)
  ) {
    invalidRequest()
  }
  return { bytes, extension, kind: value.kind }
}

export function hasExpectedReferenceSignature(bytes: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case 'image/png':
      return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && bytes.length >= 33 && bytes.readUInt32BE(8) === 13 && hasAsciiAt(bytes, 'IHDR', 12) && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
    case 'image/jpeg':
      return hasJpegStructure(bytes)
    case 'image/webp':
      return hasWebpStructure(bytes)
    case 'video/mp4':
      return bytes.length >= 16 && bytes.readUInt32BE(0) >= 16 && bytes.readUInt32BE(0) <= bytes.length && hasAsciiAt(bytes, 'ftyp', 4) && /^[\x20-\x7e]{4}$/.test(bytes.toString('ascii', 8, 12))
    case 'video/webm':
      return hasWebmStructure(bytes)
    case 'audio/mpeg':
      return hasId3Structure(bytes) || hasMpegFrame(bytes)
    case 'audio/wav':
      return hasWavStructure(bytes)
    case 'audio/ogg':
      return hasOggStructure(bytes)
    default:
      return false
  }
}

function hasJpegStructure(bytes: Buffer): boolean {
  if (!startsWithBytes(bytes, [0xff, 0xd8]) || bytes.length < 6) return false
  let offset = 2
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return false
    const marker = bytes[offset + 1]
    if (marker === 0xd9) return offset + 2 === bytes.length
    if (marker === 0x00 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || offset + 4 > bytes.length) return false
    const length = bytes.readUInt16BE(offset + 2)
    if (length < 2 || offset + 2 + length > bytes.length) return false
    offset += 2 + length
  }
  return false
}

function hasWebpStructure(bytes: Buffer): boolean {
  if (!startsWithAscii(bytes, 'RIFF') || !hasAsciiAt(bytes, 'WEBP', 8) || bytes.length < 20 || bytes.readUInt32LE(4) !== bytes.length - 8) return false
  const chunk = bytes.toString('ascii', 12, 16)
  const size = bytes.readUInt32LE(16)
  return ['VP8 ', 'VP8L', 'VP8X'].includes(chunk) && 20 + size + (size % 2) === bytes.length
}

function hasWebmStructure(bytes: Buffer): boolean {
  if (!startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return false
  const headerSize = readVint(bytes, 4)
  if (!headerSize || 4 + headerSize.length + headerSize.value > bytes.length) return false
  const end = 4 + headerSize.length + headerSize.value
  for (let offset = 4 + headerSize.length; offset + 3 <= end; offset += 1) {
    if (bytes[offset] !== 0x42 || bytes[offset + 1] !== 0x82) continue
    const size = readVint(bytes, offset + 2)
    if (size && offset + 2 + size.length + size.value <= end && bytes.toString('ascii', offset + 2 + size.length, offset + 2 + size.length + size.value) === 'webm') return true
  }
  return false
}

function readVint(bytes: Buffer, offset: number): { length: number; value: number } | undefined {
  const first = bytes[offset]
  if (first === undefined || first === 0) return undefined
  let length = 1
  while (length <= 8 && (first & (0x80 >> (length - 1))) === 0) length += 1
  if (length > 8 || offset + length > bytes.length) return undefined
  let value = first & (0x7f >> (length - 1))
  for (let index = 1; index < length; index += 1) value = value * 256 + bytes[offset + index]
  return { length, value }
}

function hasId3Structure(bytes: Buffer): boolean {
  if (!startsWithAscii(bytes, 'ID3') || bytes.length < 10 || bytes[3] < 2 || bytes[3] > 4) return false
  const sizeBytes = bytes.subarray(6, 10)
  return [...sizeBytes].every((value) => (value & 0x80) === 0) && 10 + ((sizeBytes[0] << 21) | (sizeBytes[1] << 14) | (sizeBytes[2] << 7) | sizeBytes[3]) <= bytes.length
}

function hasMpegFrame(bytes: Buffer): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || (bytes[1] & 0xfe) !== 0xfa) return false
  const bitrateIndex = bytes[2] >> 4
  const sampleIndex = (bytes[2] >> 2) & 3
  const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
  const samples = [44100, 48000, 32000]
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) return false
  return Math.floor((144 * bitrates[bitrateIndex] * 1000) / samples[sampleIndex]) + ((bytes[2] >> 1) & 1) <= bytes.length
}

function hasWavStructure(bytes: Buffer): boolean {
  if (!startsWithAscii(bytes, 'RIFF') || !hasAsciiAt(bytes, 'WAVE', 8) || bytes.length < 20 || bytes.readUInt32LE(4) !== bytes.length - 8) return false
  let offset = 12
  let fmt = false
  let data = false
  while (offset + 8 <= bytes.length) {
    const size = bytes.readUInt32LE(offset + 4)
    if (offset + 8 + size > bytes.length) return false
    if (hasAsciiAt(bytes, 'fmt ', offset) && size >= 16) fmt = true
    if (hasAsciiAt(bytes, 'data', offset)) data = true
    offset += 8 + size + (size % 2)
  }
  return offset === bytes.length && fmt && data
}

function hasOggStructure(bytes: Buffer): boolean {
  if (!startsWithAscii(bytes, 'OggS') || bytes.length < 28 || bytes[4] !== 0) return false
  const segments = bytes[26]
  const header = 27 + segments
  if (header > bytes.length) return false
  const packetSize = [...bytes.subarray(27, header)].reduce((sum, value) => sum + value, 0)
  if (header + packetSize > bytes.length) return false
  const packet = bytes.subarray(header, header + packetSize)
  return startsWithAscii(packet, 'OpusHead') || startsWithBytes(packet, [1, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73])
}

function startsWithBytes(bytes: Buffer, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

function startsWithAscii(bytes: Buffer, signature: string): boolean {
  return hasAsciiAt(bytes, signature, 0)
}

function hasAsciiAt(bytes: Buffer, signature: string, offset: number): boolean {
  return bytes.length >= offset + signature.length && bytes.toString('ascii', offset, offset + signature.length) === signature
}

function validateReferenceCombination(
  targetKind: TargetKind,
  references: ValidReference[],
): ValidGeneration['videoMode'] {
  if (targetKind === 'image') {
    if (references.some((reference) => reference.kind !== 'image')) {
      invalidRequest()
    }
    return undefined
  }
  if (references.length === 0) {
    return 'text2video'
  }
  if (references.length !== 1) {
    invalidRequest()
  }
  if (references[0].kind === 'image') {
    return 'singleImage2video'
  }
  if (references[0].kind === 'video') {
    return 'video2video'
  }
  invalidRequest()
}

function createNodeArguments(generation: ValidGeneration, referenceNames: string[]): string[] {
  const modelName =
    generation.targetKind === 'image'
      ? generation.selection.imageModelName
      : generation.selection.videoModelName
  const args = [
    'node',
    '--x',
    '0',
    '--y',
    '0',
    'create',
    `generation-${generation.targetKind}`,
    '-p',
    generation.selection.projectUuid,
    '-t',
    generation.targetKind,
    '--prompt',
    generation.prompt,
    '-s',
    `model=${modelName}`,
  ]
  for (const referenceName of referenceNames) {
    args.push('--left', referenceName)
  }
  if (generation.videoMode) {
    args.push('-s', `modeType=${generation.videoMode}`)
  }
  args.push('--run')
  return args
}

function parseGeneratedAsset(stdout: string, expectedKind: TargetKind): LibTvGeneratedAsset {
  let payload: unknown
  try {
    payload = JSON.parse(stdout) as unknown
  } catch {
    invalidResult()
  }
  if (!isRecord(payload) || payload.type !== expectedKind || !isRecord(payload.data)) {
    invalidResult()
  }
  const urls = payload.data.url
  if (!Array.isArray(urls)) {
    invalidResult()
  }
  const url = urls.find((candidate): candidate is string => typeof candidate === 'string' && isHttpUrl(candidate))
  if (!url) {
    invalidResult()
  }

  return {
    kind: expectedKind,
    url,
    mimeType: `${expectedKind}/*`,
    ...optionalHttpUrl(payload.data, 'poster'),
    ...optionalPositiveNumber(payload.data, 'width'),
    ...optionalPositiveNumber(payload.data, 'height'),
    ...optionalDuration(payload.data),
  }
}

function optionalHttpUrl(payload: Record<string, unknown>, key: 'poster'): Record<string, string> {
  const value = payload[key]
  return typeof value === 'string' && isHttpUrl(value) ? { [key]: value } : {}
}

function optionalPositiveNumber(
  payload: Record<string, unknown>,
  key: 'width' | 'height',
): Record<string, number> {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? { [key]: value } : {}
}

function optionalDuration(payload: Record<string, unknown>): Record<string, number> {
  const value = payload.duration
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? { durationSeconds: value }
    : {}
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isReferenceKind(value: unknown): value is ReferenceKind {
  return value === 'image' || value === 'video' || value === 'audio'
}

function isTargetKind(value: unknown): value is TargetKind {
  return value === 'image' || value === 'video'
}

function invalidRequest(): never {
  throw new Error('LibTV generation request is invalid')
}

function invalidResult(): never {
  throw new Error('LibTV generation result is invalid')
}
