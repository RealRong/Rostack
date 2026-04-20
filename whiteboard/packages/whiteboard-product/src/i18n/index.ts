import * as keys from '@whiteboard/product/i18n/keys'
import * as tokens from '@whiteboard/product/i18n/tokens'
import { registerWhiteboardProductI18n } from '@whiteboard/product/i18n/register'
import { whiteboardProductEnResources } from '@whiteboard/product/i18n/resources/en'
import { whiteboardProductZhCNResources } from '@whiteboard/product/i18n/resources/zh-CN'

export const i18n = {
  keys,
  tokens,
  register: registerWhiteboardProductI18n,
  resources: {
    en: whiteboardProductEnResources,
    zhCN: whiteboardProductZhCNResources
  }
} as const
