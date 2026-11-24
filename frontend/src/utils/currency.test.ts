import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatCurrency, resolveCurrencyCode } from './currency.ts'

describe('receipt currency codes', () => {
  it('treats a printed rand symbol as ZAR', () => {
    assert.equal(resolveCurrencyCode('R'), 'ZAR')
    assert.equal(resolveCurrencyCode(' rand '), 'ZAR')
    assert.equal(resolveCurrencyCode(''), 'ZAR')
    assert.equal(resolveCurrencyCode(null), 'ZAR')
  })

  it('keeps a real ISO code', () => {
    assert.equal(resolveCurrencyCode('usd'), 'USD')
  })

  it('formats a bad code without throwing', () => {
    assert.equal(formatCurrency(12.5, 'R'), formatCurrency(12.5, 'ZAR'))
    assert.doesNotThrow(() => formatCurrency(12.5, ''))
  })
})
