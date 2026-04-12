# How "Who Owes Who" Is Calculated

This document explains the full math behind SplitEasy's balance computation, split logic, and debt simplification for all group sizes.

---

## Table of Contents

1. [Overview](#overview)
2. [How Splits Are Calculated](#how-splits-are-calculated)
3. [How Balances Are Accumulated](#how-balances-are-accumulated)
4. [How Suggested Settlements Are Computed](#how-suggested-settlements-are-computed)
5. [Worked Examples](#worked-examples)
6. [Edge Cases and Guarantees](#edge-cases-and-guarantees)

---

## Overview

Every group member has a single running **net balance** (a signed decimal number):

- **Positive** = others owe you money (you are a creditor)
- **Negative** = you owe others money (you are a debtor)
- **Zero** = you are settled

The sum of all balances in a group is always **exactly zero** — money is never created or destroyed, only redistributed.

Three types of events affect balances:

| Event | Effect |
|-------|--------|
| **Manual entry** | Payer's balance goes up, split members' balances go down |
| **Receipt assignment** | Payer's balance goes up, assigned members' balances go down |
| **Settlement** | Payer's balance goes up, recipient's balance goes down |

---

## How Splits Are Calculated

When an expense is created (manual entry or receipt line item), the total amount must be divided among members. There are three split types, each with penny-perfect arithmetic.

### Rounding Rule

All money values are rounded to 2 decimal places using **ROUND_HALF_UP**:

```
round(value) = value.quantize(0.01, rounding=ROUND_HALF_UP)
```

### Remainder Pattern

To avoid losing or gaining pennies, the same pattern is used everywhere:

```
per_person = round(total / N)

For members 1 to N-1:  share = per_person
For member N (last):    share = total - sum(all previous shares)
```

The last person (sorted by UUID) absorbs any rounding remainder. This guarantees the shares sum to **exactly** the total, with at most a 1-cent difference from the rounded per-person amount.

---

### Split Type: Equal

Divides the total equally among a set of members.

**Two variants:**

1. **Equal all** — `splits: []` (empty array) — divides among ALL group members
2. **Custom equal** — `splits: [{user_id: A}, {user_id: B}]` — divides among only the listed members

**Formula:**

```
Given: total T, target members [M1, M2, ..., Mn] sorted by UUID

per_person = round(T / n)

M1 gets: per_person
M2 gets: per_person
...
M(n-1) gets: per_person
Mn gets: T - (per_person * (n-1))
```

### Split Type: Full

Assigns the entire amount to a single member.

```
Given: total T, target user U
U gets: round(T)
```

**Constraint:** The target cannot be the same person who paid.

### Split Type: Percentage

Each member is assigned a percentage. Percentages must sum to exactly 100%.

```
Given: total T, splits [(M1, P1%), (M2, P2%), ..., (Mn, Pn%)]

M1 gets: round(T * P1 / 100)
...
M(n-1) gets: round(T * P(n-1) / 100)
Mn gets: T - sum(M1..M(n-1))       <-- remainder
```

---

## How Balances Are Accumulated

The balance engine (`compute_group_balances` in `balances.py`) walks through every receipt, manual entry, and settlement in the group and accumulates a net balance per member.

### Step 1: Initialize

Every group member starts at `0.00`.

### Step 2: Process Receipts

For each **assigned** receipt, for each line item, for each item assignment:

```
payer = receipt.paid_by

For each assignment on the item:
    IF assignment.user != payer:
        assignment.user  -=  share_amount    (they owe this much)
        payer            +=  share_amount    (they are owed this much)
    ELSE:
        skip (you don't owe yourself)
```

### Step 3: Process Manual Entries

For each manual entry, for each split row:

```
payer = entry.created_by

For each split:
    IF split.user != payer:
        split.user  -=  split.amount
        payer       +=  split.amount
    ELSE:
        skip
```

### Step 4: Process Settlements

A settlement records "debtor paid creditor in real life":

```
paid_by (debtor)    +=  amount   (debt reduced)
paid_to (creditor)  -=  amount   (credit reduced)
```

**Validation rules:**
- `paid_by` must have a negative balance (is a debtor)
- `paid_to` must have a positive balance (is a creditor)
- Amount cannot exceed the debtor's outstanding balance

### The Self-Skip Rule

This is the most important detail. When Alice pays R90 for dinner split equally among Alice, Bob, and Carol:

- Split rows are created for all three: Alice=30, Bob=30, Carol=30
- But balance updates only happen when `split.user != payer`
- Alice's own R30 row is skipped — she paid and consumed it, so it's a net-zero for her
- Only Bob's R30 and Carol's R30 create balance entries

This means Alice's balance goes up by R60 (what others owe her), not R90 (what she paid). The R30 she consumed herself cancels out.

---

## How Suggested Settlements Are Computed

For settling debts, the system computes the minimum set of transfers using a **greedy algorithm**.

### Algorithm

```
1. Separate members into:
   - Debtors:   those with balance < 0 (owe money)
   - Creditors: those with balance > 0 (are owed money)

2. Sort both lists by amount descending (largest first)

3. While debtors and creditors remain:
   a. Take the largest debtor D and largest creditor C
   b. transfer = min(|D.balance|, C.balance)
   c. Record: "D pays C the transfer amount"
   d. Reduce D's debt and C's credit by transfer
   e. If D is fully settled, move to next debtor
   f. If C is fully settled, move to next creditor
```

### Properties

| Property | Guarantee |
|----------|-----------|
| **Correctness** | Every balance reaches zero |
| **Conservation** | Sum of transfers = sum of all debts = sum of all credits |
| **Upper bound** | At most N-1 transfers for N members |
| **2-user case** | Exactly 1 transfer (same as before N-user support) |
| **All settled** | If all balances are zero, produces 0 transfers |

---

## Worked Examples

### Example 1: Two Members (Classic Case)

**Group:** Alice, Bob

| Event | Payer | Amount | Split |
|-------|-------|--------|-------|
| Lunch | Alice | R200 | Equal all |

**Split:** `round(200/2) = 100.00` each.

**Balance updates:**

| Assignment | User = Payer? | Update |
|------------|---------------|--------|
| Alice: 100 | Yes (skip) | — |
| Bob: 100 | No | Bob -= 100, Alice += 100 |

**Final:** Alice = **+100**, Bob = **-100** (sum = 0)

**Settlement:** Bob pays Alice R100 (1 transfer).

---

### Example 2: Three Members, Equal Splits

**Group:** Alice, Bob, Carol

| Event | Payer | Amount | Split |
|-------|-------|--------|-------|
| Dinner | Alice | R90 | Equal all |
| Taxi | Bob | R30 | Equal all |

**Dinner (R90, Alice pays, equal 3-way):**

```
per_person = round(90/3) = 30.00
Shares: Alice=30, Bob=30, Carol=30 (last gets 90-60=30)
```

| Assignment | User = Payer? | Update |
|------------|---------------|--------|
| Alice: 30 | Yes (skip) | — |
| Bob: 30 | No | Bob -= 30, Alice += 30 |
| Carol: 30 | No | Carol -= 30, Alice += 30 |

After dinner: Alice = +60, Bob = -30, Carol = -30

**Taxi (R30, Bob pays, equal 3-way):**

```
per_person = round(30/3) = 10.00
Shares: Alice=10, Bob=10, Carol=10 (last gets 30-20=10)
```

| Assignment | User = Payer? | Update |
|------------|---------------|--------|
| Alice: 10 | No | Alice -= 10, Bob += 10 |
| Bob: 10 | Yes (skip) | — |
| Carol: 10 | No | Carol -= 10, Bob += 10 |

**Final:** Alice = +50, Bob = -10, Carol = -40 (sum = 0)

**Suggested settlements:**

```
Debtors (desc):  Carol(40), Bob(10)
Creditors (desc): Alice(50)

Step 1: Carol pays Alice min(40, 50) = R40 → Carol done, Alice has 10 left
Step 2: Bob pays Alice min(10, 10)   = R10 → Both done

Result: 2 transfers
```

---

### Example 3: Custom Equal (Subset Split)

**Group:** Alice, Bob, Carol, Dave

| Event | Payer | Amount | Split |
|-------|-------|--------|-------|
| Dessert | Alice | R50 | Custom equal: Bob + Carol only |

**Split:** Only Bob and Carol are targets (N=2).

```
per_person = round(50/2) = 25.00
Bob: 25.00, Carol: 50-25 = 25.00
```

| Assignment | User = Payer? | Update |
|------------|---------------|--------|
| Bob: 25 | No | Bob -= 25, Alice += 25 |
| Carol: 25 | No | Carol -= 25, Alice += 25 |

**Final:** Alice = +50, Bob = -25, Carol = -25, Dave = 0

Note: Alice paid for Bob and Carol but is NOT in the split target list, so she is owed the full R50. Dave wasn't involved at all.

---

### Example 4: Payer Included in Custom Equal

**Group:** Alice, Bob, Carol

| Event | Payer | Amount | Split |
|-------|-------|--------|-------|
| Coffee | Alice | R60 | Custom equal: Alice + Bob |

**Split:** Alice and Bob are targets (N=2). Carol is excluded.

```
per_person = round(60/2) = 30.00
Alice: 30.00, Bob: 60-30 = 30.00
```

| Assignment | User = Payer? | Update |
|------------|---------------|--------|
| Alice: 30 | Yes (skip) | — |
| Bob: 30 | No | Bob -= 30, Alice += 30 |

**Final:** Alice = +30, Bob = -30, Carol = 0

Alice paid R60 but consumed R30 of it herself, so she's only owed R30.

---

### Example 5: Receipt with Mixed Assignments (3 Members)

**Group:** Alice, Bob, Carol. Alice pays the receipt.

| Line Item | Amount | Assignment |
|-----------|--------|------------|
| Pizza | R60 | Equal all 3 |
| Beer | R40 | Full: Bob |
| Salad | R30 | Custom equal: Alice + Carol |

**Pizza (R60, equal all 3):**

```
per_person = round(60/3) = 20.00
Alice: 20, Bob: 20, Carol: 60-40 = 20
```

| Assignment | Update |
|------------|--------|
| Alice: 20 | Skip (payer) |
| Bob: 20 | Bob -= 20, Alice += 20 |
| Carol: 20 | Carol -= 20, Alice += 20 |

**Beer (R40, full Bob):**

| Assignment | Update |
|------------|--------|
| Bob: 40 | Bob -= 40, Alice += 40 |

**Salad (R30, custom equal Alice + Carol):**

```
per_person = round(30/2) = 15.00
Alice: 15, Carol: 30-15 = 15
```

| Assignment | Update |
|------------|--------|
| Alice: 15 | Skip (payer) |
| Carol: 15 | Carol -= 15, Alice += 15 |

**Final:**

```
Alice: +20 +20 +40 +15 = +95
Bob:   -20 -40         = -60
Carol: -20 -15         = -35
Sum: 95 - 60 - 35 = 0  ✓
```

**Suggested settlements:**

```
Debtors (desc):  Bob(60), Carol(35)
Creditors (desc): Alice(95)

Step 1: Bob pays Alice min(60, 95)   = R60 → Bob done, Alice has 35 left
Step 2: Carol pays Alice min(35, 35) = R35 → Both done

Result: 2 transfers
```

---

### Example 6: Four Members, Multiple Payers

**Group:** Alice, Bob, Carol, Dave

| Event | Payer | Amount | Split |
|-------|-------|--------|-------|
| Groceries | Alice | R120 | Equal all 4 |
| Movie tickets | Bob | R80 | Equal all 4 |
| Parking | Carol | R20 | Custom equal: Carol + Dave |

**Groceries (R120, Alice pays, equal 4):**

```
per_person = round(120/4) = 30.00
All get 30 (last: 120-90=30)

Bob -= 30, Alice += 30
Carol -= 30, Alice += 30
Dave -= 30, Alice += 30
```

After: Alice=+90, Bob=-30, Carol=-30, Dave=-30

**Movie (R80, Bob pays, equal 4):**

```
per_person = round(80/4) = 20.00

Alice -= 20, Bob += 20
Carol -= 20, Bob += 20
Dave -= 20, Bob += 20
```

After: Alice=+70, Bob=-30+60=+30, Carol=-50, Dave=-50

**Parking (R20, Carol pays, custom equal Carol+Dave):**

```
per_person = round(20/2) = 10.00

Carol: skip (payer)
Dave -= 10, Carol += 10
```

**Final:** Alice=+70, Bob=+30, Carol=-40, Dave=-60 (sum=0)

**Suggested settlements:**

```
Debtors (desc):  Dave(60), Carol(40)
Creditors (desc): Alice(70), Bob(30)

Step 1: Dave pays Alice min(60, 70)   = R60 → Dave done, Alice has 10 left
Step 2: Carol pays Alice min(40, 10)  = R10 → Alice done, Carol has 30 left
Step 3: Carol pays Bob min(30, 30)    = R30 → Both done

Result: 3 transfers (for 4 members, max is 3)
```

---

### Example 7: Settlement Partially Settles a Debt

**Group:** Alice, Bob, Carol. Starting balances from Example 2: Alice=+50, Bob=-10, Carol=-40.

Bob settles his R10 debt with Alice:

```
Bob (paid_by)   += 10  → Bob: -10 + 10 = 0
Alice (paid_to) -= 10  → Alice: +50 - 10 = +40
```

**After settlement:** Alice=+40, Bob=0, Carol=-40

**Remaining:** Carol pays Alice R40 (1 transfer left).

---

### Example 8: Rounding Edge Case

**Group:** Alice, Bob, Carol

| Event | Payer | Amount | Split |
|-------|-------|--------|-------|
| Coffee | Alice | R10 | Equal all 3 |

```
per_person = round(10/3) = round(3.33333...) = 3.33

Alice: 3.33 (skip — payer)
Bob:   3.33
Carol: 10.00 - 6.66 = 3.34   <-- 1 cent more (remainder)
```

**Balances:** Alice=+6.67, Bob=-3.33, Carol=-3.34 (sum=0)

The extra penny always goes to the last person by UUID sort order. This is deterministic and reproducible.

---

## Edge Cases and Guarantees

### Penny-Perfect Arithmetic

- All calculations use Python `Decimal` (not floating point)
- The remainder pattern ensures splits always sum to exactly the total
- Maximum rounding error per person: 1 cent
- The last member (by sorted UUID) absorbs any remainder

### Zero-Sum Invariant

The balance engine guarantees that the sum of all member balances is always exactly zero. This is enforced by the symmetric update pattern: every `-= amount` is paired with a `+= amount`.

### Self-Skip Rule

When the payer is included in the split, their own share is skipped in the balance calculation. This is correct because:
- They paid the full amount out of pocket
- Their share represents what they consumed themselves
- The difference (total - their share) is what others owe them

### Settlement Validation

Settlements are validated against current balances:
- The payer must be a debtor (negative balance)
- The recipient must be a creditor (positive balance)
- The amount cannot exceed the payer's debt

This prevents over-settlement and ensures balances stay consistent.

### Group Size Behavior

| Group Size | Behavior |
|------------|----------|
| 1 member | No splits possible (need at least 2) |
| 2 members | 1 transfer to settle. UI shows simple "you owe / are owed" |
| 3+ members | Up to N-1 transfers. UI shows net position + suggested settlements |

### What Cannot Break

1. **Adding members doesn't affect existing balances** — past entries/receipts are already split and recorded. New members start at 0.
2. **The split calculation is stateless** — it only depends on the total amount and target members at creation time.
3. **Settlements are validated at creation** — direction and amount are checked against live balances.
4. **The greedy algorithm always terminates** — each step settles at least one person.
5. **The sum of suggested transfers equals the sum of debts** — no money is lost or created.
