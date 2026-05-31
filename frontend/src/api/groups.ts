import { api } from '@/api/client'
import type {
  Group,
  GroupBalanceResponse,
  GroupHistoryItem,
  GroupInvitation,
  GroupMember,
  ManualEntryDetail,
  ManualEntry,
  OCRLineItem,
  Receipt,
  ReceiptShareOut,
  Settlement,
  SuggestedSettlement,
} from '@/types/models'

export async function listGroups() {
  const response = await api.get<Group[]>('/groups')
  return response.data
}

export async function createGroup(name: string) {
  const response = await api.post<Group>('/groups', { name })
  return response.data
}

export async function inviteToGroup(groupId: string, email: string) {
  const response = await api.post<{ invitation_id: string; join_code: string }>(
    `/groups/${groupId}/invite`,
    { email },
  )
  return response.data
}

export async function getInvitations(groupId: string) {
  const response = await api.get<GroupInvitation[]>(`/groups/${groupId}/invitations`)
  return response.data
}

export async function joinGroup(groupId: string, invitationId: string) {
  const response = await api.post<{ joined: boolean }>(`/groups/${groupId}/join`, {
    invitation_id: invitationId,
  })
  return response.data
}

export async function joinGroupByCode(code: string) {
  const response = await api.post<{ joined: boolean; group_id: string }>('/groups/join-by-code', {
    code,
  })
  return response.data
}

export async function getGroupMembers(groupId: string) {
  const response = await api.get<GroupMember[]>(`/groups/${groupId}/members`)
  return response.data
}

export async function getGroup(groupId: string) {
  const response = await api.get<Group>(`/groups/${groupId}`)
  return response.data
}

export async function updateGroup(groupId: string, name: string) {
  const response = await api.patch<Group>(`/groups/${groupId}`, { name })
  return response.data
}

export async function updateGroupProfilePicture(groupId: string, picture: string) {
  const response = await api.patch<Group>(`/groups/${groupId}/profile-picture`, { profile_picture: picture })
  return response.data
}

export async function deleteGroup(groupId: string) {
  await api.delete(`/groups/${groupId}`)
}

export async function getBalances(groupId: string) {
  const response = await api.get<GroupBalanceResponse>(`/groups/${groupId}/balances`)
  return response.data
}

export async function getSuggestedSettlements(groupId: string) {
  const response = await api.get<SuggestedSettlement[]>(`/groups/${groupId}/balances/suggested-settlements`)
  return response.data
}

export async function getHistory(groupId: string, type?: string) {
  const response = await api.get<{ items: GroupHistoryItem[] }>(`/groups/${groupId}/history`, {
    params: type ? { type } : undefined,
  })
  return response.data.items
}

export async function getAllHistory(options?: { type?: string; groupId?: string }) {
  const response = await api.get<{ items: GroupHistoryItem[] }>('/groups/history', {
    params: {
      ...(options?.type ? { type: options.type } : {}),
      ...(options?.groupId ? { group_id: options.groupId } : {}),
    },
  })
  return response.data.items
}

export async function createManualEntry(groupId: string, payload: unknown) {
  const response = await api.post<ManualEntry>(`/groups/${groupId}/entries`, payload)
  return response.data
}

export async function listEntries(groupId: string) {
  const response = await api.get<ManualEntry[]>(`/groups/${groupId}/entries`)
  return response.data
}

export async function getEntry(groupId: string, entryId: string) {
  const response = await api.get<ManualEntryDetail>(`/groups/${groupId}/entries/${entryId}`)
  return response.data
}

export async function updateEntry(groupId: string, entryId: string, payload: unknown) {
  const response = await api.patch<ManualEntryDetail>(`/groups/${groupId}/entries/${entryId}`, payload)
  return response.data
}

export async function deleteEntry(groupId: string, entryId: string) {
  await api.delete(`/groups/${groupId}/entries/${entryId}`)
}

export async function markEntryPaid(groupId: string, entryId: string) {
  const response = await api.post<ManualEntryDetail>(`/groups/${groupId}/entries/${entryId}/mark-paid`)
  return response.data
}

export async function unmarkEntryPaid(groupId: string, entryId: string) {
  const response = await api.delete<ManualEntryDetail>(`/groups/${groupId}/entries/${entryId}/mark-paid`)
  return response.data
}

export async function markReceiptPaid(groupId: string, receiptId: string) {
  const response = await api.post<ReceiptShareOut>(`/groups/${groupId}/receipts/${receiptId}/mark-paid`)
  return response.data
}

export async function unmarkReceiptPaid(groupId: string, receiptId: string) {
  const response = await api.delete<ReceiptShareOut>(`/groups/${groupId}/receipts/${receiptId}/mark-paid`)
  return response.data
}

export async function createSettlement(groupId: string, payload: unknown) {
  const response = await api.post<Settlement>(`/groups/${groupId}/settlements`, payload)
  return response.data
}

export async function listSettlements(groupId: string) {
  const response = await api.get<Settlement[]>(`/groups/${groupId}/settlements`)
  return response.data
}

export async function uploadReceipt(groupId: string, files: File[]) {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }
  const response = await api.post<Receipt>(`/groups/${groupId}/receipts`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
  return response.data
}

export async function listReceipts(groupId: string, status?: string) {
  const response = await api.get<Receipt[]>(`/groups/${groupId}/receipts`, {
    params: status ? { status } : undefined,
  })
  return response.data
}

export async function getReceiptItems(receiptId: string) {
  const response = await api.get<OCRLineItem[]>(`/receipts/${receiptId}/items`)
  return response.data
}

export async function getReceiptImageBlob(receiptId: string, index = 0) {
  const response = await api.get<Blob>(`/receipts/${receiptId}/image`, {
    responseType: 'blob',
    params: { index },
  })
  return response.data
}

export async function updateReceiptItems(receiptId: string, payload: unknown) {
  const response = await api.put<Receipt>(`/receipts/${receiptId}/items`, payload)
  return response.data
}

export async function patchReceipt(receiptId: string, payload: unknown) {
  const response = await api.patch<Receipt>(`/receipts/${receiptId}`, payload)
  return response.data
}

export async function deleteReceipt(receiptId: string) {
  await api.delete(`/receipts/${receiptId}`)
}
