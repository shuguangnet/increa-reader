// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

// Mock the apiFetch module
vi.mock('@/app/api', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '@/app/api'
import { uploadImage } from './upload'

describe('uploadImage', () => {
  it('uploads a blob and returns path data', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ absolutePath: '/tmp/img.png', filename: 'img.png' }),
    }
    vi.mocked(apiFetch).mockResolvedValueOnce(mockResponse as any)

    // Create a small test blob
    const blob = new Blob(['test'], { type: 'text/plain' })
    const result = await uploadImage(blob)

    expect(result).toEqual({ absolutePath: '/tmp/img.png', filename: 'img.png' })
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/upload/image',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('throws on failed upload', async () => {
    const mockResponse = { ok: false, status: 500 }
    vi.mocked(apiFetch).mockResolvedValueOnce(mockResponse as any)

    const blob = new Blob(['test'], { type: 'text/plain' })
    await expect(uploadImage(blob)).rejects.toThrow('Upload failed')
  })
})
