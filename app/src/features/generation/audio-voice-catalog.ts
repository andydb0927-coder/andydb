/** Verified against the official TTS 2.0 voice table, 2026-08-28. */
export const officialAudioVoices = [
  { id: 'zh_female_vv_uranus_bigtts', name: 'Vivi 2.0', legacyLabel: '温暖女声' },
  { id: 'zh_male_m191_uranus_bigtts', name: '云舟 2.0', legacyLabel: '沉稳男声' },
  { id: 'zh_male_shaonianzixin_uranus_bigtts', name: '少年梓辛 2.0', legacyLabel: '清亮少年' },
  { id: 'zh_male_jieshuoxiaoming_uranus_bigtts', name: '解说小明 2.0', legacyLabel: '纪录片旁白' },
] as const

export function findAudioVoice(value: unknown) {
  return officialAudioVoices.find(voice => voice.id === value || voice.legacyLabel === value)
}

export function resolveAudioVoiceId(value: unknown): string {
  if (value === undefined || value === '') return officialAudioVoices[0].id
  const voice = findAudioVoice(value)
  if (!voice) throw new Error('所选音色不可用，请重新选择官方音色。')
  return voice.id
}
