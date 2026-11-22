import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultPayerId, twoPersonAssignOptions, twoPersonPaidByOptions } from './memberLabels.ts'

const andrew = { user_id: 'andrew', display_name: 'Andrew' }
const gallia = { user_id: 'gallia', display_name: 'Gallia' }
// Owner joins first, so the API returns Andrew before Gallia.
const members = [andrew, gallia]

describe('split labels follow the signed-in member', () => {
  it('shows Andrew and Me when Gallia is signed in', () => {
    assert.deepEqual(twoPersonPaidByOptions(members, 'gallia'), [
      { value: 'andrew', label: 'Andrew' },
      { value: 'gallia', label: 'Me' },
    ])
    assert.deepEqual(twoPersonAssignOptions(members, 'gallia'), [
      { value: 'andrew', label: 'Andrew' },
      { value: 'split', label: 'Split' },
      { value: 'gallia', label: 'Me' },
    ])
  })

  it('shows Me and Gallia when Andrew is signed in', () => {
    assert.deepEqual(twoPersonPaidByOptions(members, 'andrew'), [
      { value: 'andrew', label: 'Me' },
      { value: 'gallia', label: 'Gallia' },
    ])
    assert.deepEqual(twoPersonAssignOptions(members, 'andrew'), [
      { value: 'andrew', label: 'Me' },
      { value: 'split', label: 'Split' },
      { value: 'gallia', label: 'Gallia' },
    ])
  })

  it('defaults the payer to the signed-in member', () => {
    assert.equal(defaultPayerId(members, 'gallia'), 'gallia')
    assert.equal(defaultPayerId(members, 'andrew'), 'andrew')
  })
})
