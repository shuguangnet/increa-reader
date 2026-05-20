import { describe, expect, it } from 'vitest'
import { coerce } from './coerce'

describe('coerce', () => {
  it('returns value if already the correct type', () => {
    expect(coerce('boolean', true)).toBe(true)
    expect(coerce('integer', 42)).toBe(42)
    expect(coerce('number', 3.14)).toBe(3.14)
    expect(coerce('string', 'hello')).toBe('hello')
  })

  it('coerces string to boolean', () => {
    expect(coerce('boolean', 'true')).toBe(true)
    expect(coerce('boolean', 'false')).toBe(false)
    expect(coerce('boolean', 'TRUE')).toBe(true)
  })

  it('coerces string to integer', () => {
    expect(coerce('integer', '42')).toBe(42)
    expect(coerce('integer', '3.7')).toBe(3) // parseInt truncates
  })

  it('coerces string to number', () => {
    expect(coerce('number', '3.14')).toBeCloseTo(3.14)
    expect(coerce('number', '42')).toBe(42)
  })

  it('coerces string to object via JSON.parse', () => {
    expect(coerce('object', '{"key": "value"}')).toEqual({ key: 'value' })
  })

  it('coerces string to array via JSON.parse', () => {
    expect(coerce('array', '[1, 2, 3]')).toEqual([1, 2, 3])
  })

  it('returns value unchanged if type check fails and no coercion exists', () => {
    expect(coerce('string', 123)).toBe(123)
  })

  it('handles JS object literals with new Function fallback', () => {
    expect(coerce('object', '{angle: 0}')).toEqual({ angle: 0 })
  })
})