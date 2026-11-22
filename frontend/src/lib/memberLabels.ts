type NamedMember = {
  user_id: string
  display_name: string
}

function labelFor(member: NamedMember, currentUserId: string | undefined) {
  return currentUserId && member.user_id === currentUserId ? 'Me' : member.display_name
}

export function defaultPayerId(members: { user_id: string }[], currentUserId: string | undefined) {
  return members.find((member) => member.user_id === currentUserId)?.user_id ?? members[0]?.user_id ?? ''
}

export function twoPersonPaidByOptions(members: NamedMember[], currentUserId: string | undefined) {
  return members.map((member) => ({
    value: member.user_id,
    label: labelFor(member, currentUserId),
  }))
}

export function twoPersonAssignOptions(members: NamedMember[], currentUserId: string | undefined) {
  if (members.length !== 2) return []
  const [first, second] = members
  return [
    { value: first.user_id, label: labelFor(first, currentUserId) },
    { value: 'split', label: 'Split' },
    { value: second.user_id, label: labelFor(second, currentUserId) },
  ]
}
