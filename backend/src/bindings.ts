export interface WorkerBindings {
  DEVICE_TOKEN_SECRET: string
  INVITE_CODES: string
  ARK_API_KEY: string
  OPENSPEECH_API_KEY: string
  ARK_API_BASE?: string
  OPENSPEECH_API_BASE?: string
  SEEDREAM_MODEL_ID?: string
  SEEDANCE_MODEL_ID?: string
  ARK_TEXT_MODEL_ID?: string
  OPENSPEECH_RESOURCE_ID?: string
  DEVICE_TOKEN_TTL_SECONDS?: string
  UPSTREAM_TIMEOUT_MS?: string
}

export interface AppVariables {
  deviceId: string
}

export interface AppEnv {
  Bindings: WorkerBindings
  Variables: AppVariables
}
