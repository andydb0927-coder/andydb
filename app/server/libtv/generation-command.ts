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
      return hasPngStructure(bytes)
    case 'image/jpeg':
      return hasJpegStructure(bytes)
    case 'image/webp':
      return hasWebpStructure(bytes)
    case 'video/mp4':
      return hasMp4Structure(bytes)
    case 'video/webm':
      return hasWebmStructure(bytes)
    default:
      return false
  }
}

function hasPngStructure(bytes: Buffer): boolean {
  if (!startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return false
  }

  let offset = 8
  let chunkIndex = 0
  let hasImageData = false
  while (offset + 12 <= bytes.length) {
    const dataLength = bytes.readUInt32BE(offset)
    const dataStart = offset + 8
    const dataEnd = dataStart + dataLength
    const chunkEnd = dataEnd + 4
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > bytes.length) return false

    const chunkType = bytes.toString('ascii', offset + 4, offset + 8)
    if (chunkIndex === 0) {
      if (
        chunkType !== 'IHDR' ||
        dataLength !== 13 ||
        bytes.readUInt32BE(dataStart) === 0 ||
        bytes.readUInt32BE(dataStart + 4) === 0
      ) {
        return false
      }
    } else if (chunkType === 'IHDR') {
      return false
    }

    if (chunkType === 'IDAT') {
      if (dataLength === 0) return false
      hasImageData = true
    }
    if (chunkType === 'IEND') {
      return dataLength === 0 && hasImageData && chunkEnd === bytes.length
    }

    offset = chunkEnd
    chunkIndex += 1
  }
  return false
}

function hasJpegStructure(bytes: Buffer): boolean {
  if (!startsWithBytes(bytes, [0xff, 0xd8]) || bytes.length < 10) return false
  let offset = 2
  let hasStartOfFrame = false
  let hasStartOfScan = false

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) return false
    const marker = bytes[offset]
    offset += 1

    if (marker === 0x00 || marker === 0xd8 || marker === 0x01) return false
    if (marker === 0xd9) {
      return hasStartOfFrame && hasStartOfScan && offset === bytes.length
    }
    if (marker >= 0xd0 && marker <= 0xd7) return false
    if (offset + 2 > bytes.length) return false

    const segmentLength = bytes.readUInt16BE(offset)
    const dataStart = offset + 2
    const segmentEnd = offset + segmentLength
    if (segmentLength < 2 || segmentEnd > bytes.length) return false

    if (isJpegStartOfFrame(marker)) {
      if (
        segmentLength < 8 ||
        bytes.readUInt16BE(dataStart + 1) === 0 ||
        bytes.readUInt16BE(dataStart + 3) === 0
      ) {
        return false
      }
      hasStartOfFrame = true
    }

    offset = segmentEnd
    if (marker !== 0xda) continue
    if (!hasStartOfFrame || segmentLength < 6) return false
    hasStartOfScan = true

    let foundNextMarker = false
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1
        continue
      }

      const entropyMarkerStart = offset
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
      if (offset >= bytes.length) return false
      const entropyMarker = bytes[offset]
      offset += 1
      if (entropyMarker === 0x00 || (entropyMarker >= 0xd0 && entropyMarker <= 0xd7)) {
        continue
      }

      offset = entropyMarkerStart
      foundNextMarker = true
      break
    }
    if (!foundNextMarker) return false
  }
  return false
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    ![0xc4, 0xc8, 0xcc].includes(marker)
  )
}

function hasWebpStructure(bytes: Buffer): boolean {
  if (
    !startsWithAscii(bytes, 'RIFF') ||
    !hasAsciiAt(bytes, 'WEBP', 8) ||
    bytes.length < 20 ||
    bytes.readUInt32LE(4) !== bytes.length - 8
  ) {
    return false
  }

  let offset = 12
  let chunkIndex = 0
  let hasExtendedHeader = false
  let hasImagePayload = false
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString('ascii', offset, offset + 4)
    const dataLength = bytes.readUInt32LE(offset + 4)
    const dataStart = offset + 8
    const dataEnd = dataStart + dataLength
    const chunkEnd = dataEnd + (dataLength % 2)
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > bytes.length) return false

    if (chunkType === 'VP8X') {
      if (chunkIndex !== 0 || dataLength !== 10) return false
      hasExtendedHeader = true
    } else if (chunkType === 'VP8 ' || chunkType === 'VP8L') {
      if (dataLength === 0 || hasImagePayload) return false
      if (!hasExtendedHeader && chunkIndex !== 0) return false
      hasImagePayload = true
    } else if (chunkType === 'ANMF') {
      if (!hasExtendedHeader || dataLength < 16) return false
      hasImagePayload = true
    } else if (!hasExtendedHeader) {
      return false
    }

    offset = chunkEnd
    chunkIndex += 1
  }
  return offset === bytes.length && hasImagePayload
}

function hasMp4Structure(bytes: Buffer): boolean {
  let offset = 0
  let hasFileType = false
  let hasMovie = false
  let hasMediaData = false

  while (offset + 8 <= bytes.length) {
    const size32 = bytes.readUInt32BE(offset)
    const boxType = bytes.toString('ascii', offset + 4, offset + 8)
    let headerLength = 8
    let boxLength = size32
    if (size32 === 1) {
      if (offset + 16 > bytes.length) return false
      const largeSize = bytes.readBigUInt64BE(offset + 8)
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return false
      headerLength = 16
      boxLength = Number(largeSize)
    } else if (size32 === 0) {
      boxLength = bytes.length - offset
    }

    const boxEnd = offset + boxLength
    if (boxLength < headerLength || !Number.isSafeInteger(boxEnd) || boxEnd > bytes.length) {
      return false
    }

    const payloadLength = boxLength - headerLength
    if (boxType === 'ftyp') {
      if (
        offset !== 0 ||
        payloadLength < 8 ||
        !/^[\x20-\x7e]{4}$/.test(
          bytes.toString('ascii', offset + headerLength, offset + headerLength + 4),
        )
      ) {
        return false
      }
      hasFileType = true
    } else if (boxType === 'moov') {
      if (payloadLength === 0) return false
      hasMovie = true
    } else if (boxType === 'mdat') {
      if (payloadLength === 0) return false
      hasMediaData = true
    }

    offset = boxEnd
  }

  return offset === bytes.length && hasFileType && hasMovie && hasMediaData
}

interface EbmlElement {
  id: number
  dataStart: number
  end: number
}

function hasWebmStructure(bytes: Buffer): boolean {
  const header = readEbmlElement(bytes, 0, bytes.length)
  if (!header || header.id !== 0x1a45dfa3) return false
  const docType = findEbmlChild(bytes, header.dataStart, header.end, 0x4282)
  if (
    !docType ||
    bytes.toString('ascii', docType.dataStart, docType.end) !== 'webm'
  ) {
    return false
  }

  const segment = readEbmlElement(bytes, header.end, bytes.length)
  if (
    !segment ||
    segment.id !== 0x18538067 ||
    segment.end !== bytes.length
  ) {
    return false
  }

  const tracks = findEbmlChild(bytes, segment.dataStart, segment.end, 0x1654ae6b)
  const cluster = findEbmlChild(bytes, segment.dataStart, segment.end, 0x1f43b675)
  if (!tracks || !cluster) return false

  return (
    Boolean(findEbmlChild(bytes, tracks.dataStart, tracks.end, 0xae)) &&
    Boolean(
      findEbmlChild(bytes, cluster.dataStart, cluster.end, 0xa3) ??
      findEbmlChild(bytes, cluster.dataStart, cluster.end, 0xa0),
    )
  )
}

function readEbmlElement(
  bytes: Buffer,
  offset: number,
  limit: number,
): EbmlElement | undefined {
  const id = readEbmlVint(bytes, offset, 4, true)
  if (!id) return undefined
  const size = readEbmlVint(bytes, offset + id.length, 8, false)
  if (!size) return undefined
  const dataStart = offset + id.length + size.length
  const end = size.unknown ? limit : dataStart + size.value
  if (!Number.isSafeInteger(end) || dataStart > limit || end > limit) return undefined
  return { id: id.value, dataStart, end }
}

function findEbmlChild(
  bytes: Buffer,
  start: number,
  end: number,
  targetId: number,
): EbmlElement | undefined {
  let offset = start
  while (offset < end) {
    const child = readEbmlElement(bytes, offset, end)
    if (!child || child.end <= offset) return undefined
    if (child.id === targetId) return child
    offset = child.end
  }
  return undefined
}

function readEbmlVint(
  bytes: Buffer,
  offset: number,
  maximumLength: number,
  keepMarker: boolean,
): { length: number; value: number; unknown: boolean } | undefined {
  const first = bytes[offset]
  if (first === undefined || first === 0) return undefined
  let length = 1
  while (
    length <= maximumLength &&
    (first & (0x80 >> (length - 1))) === 0
  ) {
    length += 1
  }
  if (length > maximumLength || offset + length > bytes.length) return undefined

  const markerMask = 0x80 >> (length - 1)
  const unknown =
    !keepMarker &&
    (first & (markerMask - 1)) === markerMask - 1 &&
    bytes.subarray(offset + 1, offset + length).every((value) => value === 0xff)
  if (unknown) return { length, value: 0, unknown: true }

  let value = keepMarker ? first : first & (markerMask - 1)
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + bytes[offset + index]
    if (!Number.isSafeInteger(value)) return undefined
  }
  return { length, value, unknown: false }
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
