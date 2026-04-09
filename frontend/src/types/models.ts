export type User = {
  id: string
  email: string | null
  display_name: string
  profile_picture: string | null
  created_at: string
}

export type AuthResponse = {
  access_token: string
  token_type: string
  user: User
}

export type Group = {
  id: string
  name: string
  created_by: string
  created_at: string
}

export type GroupMember = {
  user_id: string
  display_name: string
  role: string
  joined_at: string
}

export type GroupInvitation = {
  invitation_id: string
  invited_email: string | null
  join_code: string | null
  status: 'pending' | 'accepted' | 'expired'
  expires_at: string
  created_at: string
}

export type BalanceItem = {
  user_id: string
  net_amount: string
}

export type GroupBalanceResponse = {
  group_id: string
  balances: BalanceItem[]
  is_settled: boolean
  total_owed: string
}

export type Receipt = {
  id: string
  group_id: string
  uploaded_by: string
  image_path: string
  nickname?: string | null
  merchant_name?: string | null
  total_amount?: string | null
  currency?: string | null
  paid_by_user_id?: string | null
  status: string
  created_at: string
}

export type OCRLineItem = {
  id: string
  description: string
  quantity: number
  price_per_unit: string | null
  line_subtotal: string | null
  line_discount: string
  final_line_total: string | null
  amount: string
  uncertain: boolean
  confidence: number
  assignee?: string | null
}

export type ManualEntry = {
  id: string
  group_id: string
  created_by: string
  description: string
  total_amount: string
  split_type: string
  created_at: string
}

export type ManualEntrySplit = {
  user_id: string
  amount: string
  percentage?: string | null
}

export type ManualEntryDetail = ManualEntry & {
  splits: ManualEntrySplit[]
}

export type Settlement = {
  id: string
  group_id: string
  paid_by: string
  paid_to: string
  amount: string
  notes?: string | null
  settled_at: string
}

export type GroupHistoryEntrySplitLine = {
  display_name: string
  amount: string
}

/** `data` payload for `GroupHistoryItem` when `type === 'entry'` */
export type GroupHistoryEntryData = {
  description?: string | null
  total_amount?: string | null
  split_type?: string | null
  /** Payer display name (stored as `created_by` on the API) */
  created_by?: string | null
  splits?: GroupHistoryEntrySplitLine[]
}

export type GroupHistoryItem = {
  type: 'receipt' | 'entry' | 'settlement'
  id: string
  group_id: string
  group_name: string
  timestamp: string
  data: Record<string, unknown>
}
