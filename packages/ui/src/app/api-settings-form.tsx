import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type ApiSettings, fetchApiSettings, updateApiSettings } from './api'

export function ApiSettingsForm({ open }: { open: boolean }) {
  // Provider
  const aiProviderLabelId = 'api-settings-ai-provider'
  const [aiProvider, setAiProvider] = useState<'anthropic' | 'openai'>('anthropic')

  // Anthropic
  const baseUrlId = 'api-settings-base-url'
  const apiKeyId = 'api-settings-api-key'
  const defaultModelId = 'api-settings-default-model'
  const [saved, setSaved] = useState<ApiSettings>({
    base_url: null,
    api_key: null,
    default_model: null,
    ai_provider: null,
    openai_api_key: null,
    openai_base_url: null,
    openai_model: null,
  })
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [showKey, setShowKey] = useState(false)

  // OpenAI
  const openaiBaseUrlId = 'api-settings-openai-base-url'
  const openaiApiKeyId = 'api-settings-openai-api-key'
  const openaiModelId = 'api-settings-openai-model'
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [openaiModel, setOpenaiModel] = useState('')
  const [openaiKeyTouched, setOpenaiKeyTouched] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)

  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved'>('idle')

  useEffect(() => {
    if (!open) return
    fetchApiSettings()
      .then(s => {
        setSaved(s)
        setBaseUrl(s.base_url ?? '')
        setDefaultModel(s.default_model ?? '')
        setApiKey('')
        setKeyTouched(false)
        setAiProvider((s.ai_provider as 'anthropic' | 'openai') ?? 'anthropic')
        setOpenaiBaseUrl(s.openai_base_url ?? '')
        setOpenaiModel(s.openai_model ?? '')
        setOpenaiApiKey('')
        setOpenaiKeyTouched(false)
      })
      .catch(console.error)
  }, [open])

  const handleSave = async () => {
    setLoading(true)
    try {
      const payload: Partial<ApiSettings> = {
        ai_provider: aiProvider,
        base_url: baseUrl || null,
        default_model: defaultModel || null,
        openai_base_url: openaiBaseUrl || null,
        openai_model: openaiModel || null,
      }
      // Anthropic API key
      if (apiKey) {
        payload.api_key = apiKey
      } else if (keyTouched && saved.api_key) {
        payload.api_key = ''
      }
      // OpenAI API key
      if (openaiApiKey) {
        payload.openai_api_key = openaiApiKey
      } else if (openaiKeyTouched && saved.openai_api_key) {
        payload.openai_api_key = ''
      }
      const result = await updateApiSettings(payload)
      setSaved(result)
      setApiKey('')
      setKeyTouched(false)
      setOpenaiApiKey('')
      setOpenaiKeyTouched(false)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err) {
      console.error('Failed to save API settings:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 px-4 py-2">
      {/* AI Provider 选择 */}
      <div className="space-y-1.5">
        <label htmlFor={aiProviderLabelId} className="text-sm font-medium">
          AI 服务商
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAiProvider('anthropic')}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              aiProvider === 'anthropic'
                ? 'border-foreground bg-accent text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            Anthropic Claude
          </button>
          <button
            type="button"
            onClick={() => setAiProvider('openai')}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              aiProvider === 'openai'
                ? 'border-foreground bg-accent text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            OpenAI
          </button>
        </div>
      </div>

      {/* Anthropic 配置 */}
      {aiProvider === 'anthropic' && (
        <>
          <div className="space-y-1.5">
            <label htmlFor={baseUrlId} className="text-sm font-medium">
              API 地址
            </label>
            <Input
              id={baseUrlId}
              placeholder="https://api.anthropic.com"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={apiKeyId} className="text-sm font-medium">
              API 密钥
            </label>
            <div className="relative">
              <Input
                id={apiKeyId}
                type={showKey ? 'text' : 'password'}
                placeholder={saved.api_key ?? 'sk-ant-...'}
                value={apiKey}
                onChange={e => {
                  setApiKey(e.target.value)
                  setKeyTouched(true)
                }}
                className="pr-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1.5 -translate-y-1/2"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={defaultModelId} className="text-sm font-medium">
              默认模型
            </label>
            <Input
              id={defaultModelId}
              placeholder="claude-sonnet-4-20250514"
              value={defaultModel}
              onChange={e => setDefaultModel(e.target.value)}
            />
          </div>
        </>
      )}

      {/* OpenAI 配置 */}
      {aiProvider === 'openai' && (
        <>
          <div className="space-y-1.5">
            <label htmlFor={openaiBaseUrlId} className="text-sm font-medium">
              API 地址
            </label>
            <Input
              id={openaiBaseUrlId}
              placeholder="https://api.openai.com/v1"
              value={openaiBaseUrl}
              onChange={e => setOpenaiBaseUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={openaiApiKeyId} className="text-sm font-medium">
              API 密钥
            </label>
            <div className="relative">
              <Input
                id={openaiApiKeyId}
                type={showOpenaiKey ? 'text' : 'password'}
                placeholder={saved.openai_api_key ?? 'sk-...'}
                value={openaiApiKey}
                onChange={e => {
                  setOpenaiApiKey(e.target.value)
                  setOpenaiKeyTouched(true)
                }}
                className="pr-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1.5 -translate-y-1/2"
                onClick={() => setShowOpenaiKey(!showOpenaiKey)}
              >
                {showOpenaiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={openaiModelId} className="text-sm font-medium">
              模型名称
            </label>
            <Input
              id={openaiModelId}
              placeholder="gpt-4o"
              value={openaiModel}
              onChange={e => setOpenaiModel(e.target.value)}
            />
          </div>
        </>
      )}

      <Button onClick={handleSave} disabled={loading} size="sm">
        {status === 'saved' ? '已保存' : loading ? '保存中...' : '保存'}
      </Button>
    </div>
  )
}
