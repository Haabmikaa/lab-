import { describe, it, expect } from 'vitest'
import { isIpMatch } from '../lib/network'

describe('Lab Network IP Verification (10.240.72.1 to 10.240.72.225)', () => {
  const pattern = '10.240.72.1-10.240.72.225'

  it('matches lower boundary IP 10.240.72.1', () => {
    expect(isIpMatch('10.240.72.1', pattern)).toBe(true)
  })

  it('matches intermediate lab IP 10.240.72.55', () => {
    expect(isIpMatch('10.240.72.55', pattern)).toBe(true)
  })

  it('matches upper boundary IP 10.240.72.225', () => {
    expect(isIpMatch('10.240.72.225', pattern)).toBe(true)
  })

  it('rejects IP 10.240.72.226 above the boundary', () => {
    expect(isIpMatch('10.240.72.226', pattern)).toBe(false)
  })

  it('rejects IP 10.240.72.0 below the boundary', () => {
    expect(isIpMatch('10.240.72.0', pattern)).toBe(false)
  })

  it('rejects external or cellular IP 192.168.43.1', () => {
    expect(isIpMatch('192.168.43.1', pattern)).toBe(false)
  })

  it('supports "to" syntax (10.240.72.1 to 10.240.72.225)', () => {
    expect(isIpMatch('10.240.72.42', '10.240.72.1 to 10.240.72.225')).toBe(true)
    expect(isIpMatch('10.240.72.250', '10.240.72.1 to 10.240.72.225')).toBe(false)
  })

  it('supports localhost and loopback for local simulation', () => {
    expect(isIpMatch('127.0.0.1', '127.0.0.1')).toBe(true)
    expect(isIpMatch('::1', '::1')).toBe(true)
  })
})

