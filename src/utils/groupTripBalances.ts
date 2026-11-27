/**
 * Group Trip Balances & Debt Minimisation Engine - Shopno Jatra
 *
 * Implements:
 * 1. Integer paisa arithmetic (1 BDT = 100 Paisa) with ZERO floating point math.
 * 2. Largest-remainder rule (Hare-Niemeyer method) for deterministic, exact uneven splits.
 * 3. compute_balances(expenses, members): calculates net balance for each member (sum is 0).
 * 4. minimise_transfers(balances): calculates the minimal settlement transactions ("কে কাকে কত দেবে").
 * 5. String-based BDT <-> Paisa conversions to avoid IEEE 754 precision issues.
 */

export interface GroupExpenseSplitEqual {
  type: "equal";
  participants: string[];
}

export interface GroupExpenseSplitShares {
  type: "shares" | "weights";
  shares: Record<string, number | bigint>;
}

export interface GroupExpenseSplitExact {
  type: "exact";
  amounts_paisa: Record<string, bigint | number | string>;
}

export type GroupExpenseSplit =
  | GroupExpenseSplitEqual
  | GroupExpenseSplitShares
  | GroupExpenseSplitExact
  | { [userId: string]: number | bigint }
  | Array<{ user_id: string; share_paisa?: bigint | number | string; weight?: number }>;

export interface GroupExpense {
  id?: string;
  trip_id?: string;
  paid_by: string;
  amount_paisa: bigint | number | string;
  description?: string;
  split: GroupExpenseSplit;
  created_at?: string;
}

export interface Transfer {
  from: string; // debtor user_id
  to: string; // creditor user_id
  amount_paisa: bigint; // positive integer paisa
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const HUNDRED = BigInt(100);

/**
 * Converts BDT string or number to integer paisa without floating point math.
 * E.g., "150.25" -> 15025n, "50" -> 5000n.
 */
export function bdtToPaisa(bdt: string | number): bigint {
  if (typeof bdt === "number") {
    // Round to 2 decimal places as string first to avoid float artifacts
    bdt = bdt.toFixed(2);
  }
  const clean = String(bdt).trim().replace(/,/g, "");
  if (!clean || clean === "0") return ZERO;

  const isNegative = clean.startsWith("-");
  const unsigned = isNegative ? clean.slice(1) : clean;

  const parts = unsigned.split(".");
  const integerPart = BigInt(parts[0] || "0");
  const decimalPart = (parts[1] || "").slice(0, 2).padEnd(2, "0");
  const paisaDecimal = BigInt(decimalPart);

  const totalPaisa = integerPart * HUNDRED + paisaDecimal;
  return isNegative ? -totalPaisa : totalPaisa;
}

/**
 * Converts integer paisa to formatted BDT string.
 * E.g., 15025n -> "150.25", 5000n -> "50.00".
 */
export function paisaToBdt(paisa: bigint | number | string): string {
  const p = BigInt(paisa);
  const isNegative = p < ZERO;
  const abs = isNegative ? -p : p;
  const integerPart = abs / HUNDRED;
  const remainder = abs % HUNDRED;
  const decimalStr = remainder.toString().padStart(2, "0");
  return `${isNegative ? "-" : ""}${integerPart.toString()}.${decimalStr}`;
}

/**
 * Splits an expense using the largest-remainder rule (Hare-Niemeyer method).
 * Guarantees that:
 * 1. Every participant's share is an integer paisa.
 * 2. Sum of all participants' shares EQUALS total amount_paisa EXACTLY.
 * 3. Zero floating point rounding errors.
 */
export function splitExpenseWithLargestRemainder(
  amountPaisaInput: bigint | number | string,
  split: GroupExpenseSplit,
  allMembers: string[]
): Map<string, bigint> {
  const amountPaisa = BigInt(amountPaisaInput);
  const resultMap = new Map<string, bigint>();

  if (amountPaisa <= ZERO) {
    return resultMap;
  }

  // Never allocate expense shares to users outside the trip. Invalid or empty
  // participant selections fall back to an equal split across trip members.
  const allowedMembers = Array.from(new Set(allMembers)).filter(Boolean);
  const validMembers = (ids: string[]) =>
    Array.from(new Set(ids)).filter((id) => allowedMembers.includes(id));
  const equalFallback = () => {
    const targets = allowedMembers;
    if (targets.length === 0) return resultMap;
    const sorted = [...targets].sort();
    const count = BigInt(sorted.length);
    const floorShare = amountPaisa / count;
    const remainder = Number(amountPaisa % count);
    sorted.forEach((id, index) => resultMap.set(id, floorShare + (index < remainder ? ONE : ZERO)));
    return resultMap;
  };

  // 1. Equal Split
  if (
    typeof split === "object" &&
    split !== null &&
    "type" in split &&
    split.type === "equal"
  ) {
    const participants = validMembers(split.participants);
    const targetList = participants.length > 0 ? participants : allowedMembers;
    const count = BigInt(targetList.length);

    if (count === ZERO) return resultMap;

    const floorShare = amountPaisa / count;
    const remainder = Number(amountPaisa % count);

    // Deterministic sort by userId for consistent remainder distribution
    const sortedParticipants = [...targetList].sort();

    sortedParticipants.forEach((userId, index) => {
      // First 'remainder' participants get +1 paisa
      const extra = index < remainder ? ONE : ZERO;
      resultMap.set(userId, floorShare + extra);
    });

    return resultMap;
  }

  // 2. Exact Amounts Split
  if (
    typeof split === "object" &&
    split !== null &&
    "type" in split &&
    split.type === "exact"
  ) {
    const exactShares: Record<string, bigint> = {};
    for (const [userId, val] of Object.entries(split.amounts_paisa || {})) {
      if (!allowedMembers.includes(userId)) continue;
      const share = BigInt(val || 0);
      if (share < ZERO) throw new RangeError("Expense shares cannot be negative");
      exactShares[userId] = (exactShares[userId] || ZERO) + share;
    }
    if (allowedMembers.length === 0) return resultMap;
    const assigned = Object.values(exactShares).reduce((sum, share) => sum + share, ZERO);
    if (assigned > amountPaisa) throw new RangeError("Expense shares cannot exceed the total amount");
    const remaining = amountPaisa - assigned;
    if (remaining > ZERO) {
      const recipients = Object.keys(exactShares).sort();
      if (recipients.length === 0) return equalFallback();
      exactShares[recipients[0]] += remaining;
    }
    for (const [userId, share] of Object.entries(exactShares)) resultMap.set(userId, share);
    return resultMap;
  }

  // 3. Array of splits with share_paisa or weight
  if (Array.isArray(split)) {
    const hasExactShares = split.every((item) => item.share_paisa !== undefined);
    if (hasExactShares) {
      let sumAssigned = ZERO;
      for (const item of split) {
        const share = BigInt(item.share_paisa || 0);
        if (share < ZERO) throw new RangeError("Expense shares cannot be negative");
        if (!allowedMembers.includes(item.user_id)) continue;
        resultMap.set(item.user_id, (resultMap.get(item.user_id) || ZERO) + share);
        sumAssigned += share;
      }
      const validAssigned = Array.from(resultMap.values()).reduce((sum, share) => sum + share, ZERO);
      if (validAssigned > amountPaisa) throw new RangeError("Expense shares cannot exceed the total amount");
      if (validAssigned < amountPaisa) {
        if (allowedMembers.length === 0) return resultMap;
        if (resultMap.size === 0) return equalFallback();
        const firstUser = Array.from(resultMap.keys()).sort()[0];
        resultMap.set(firstUser, (resultMap.get(firstUser) || ZERO) + amountPaisa - validAssigned);
      }
      return resultMap;
    }

    // Weight based from array
    const weights: Record<string, bigint> = {};
    for (const item of split) {
      if (allowedMembers.includes(item.user_id)) weights[item.user_id] = BigInt(item.weight || 1);
    }
    return splitWeighted(amountPaisa, weights);
  }

  // 4. Weighted / Shares Split: Record<string, number | bigint>
  const weightRecord =
    typeof split === "object" && split !== null && "shares" in split
      ? (split.shares as Record<string, number | bigint>)
      : (split as Record<string, number | bigint>);

  const weights: Record<string, bigint> = {};
  for (const [userId, w] of Object.entries(weightRecord)) {
    if (userId === "type") continue;
    if (!allowedMembers.includes(userId)) continue;
    const weightVal = BigInt(w || 1);
    if (weightVal > ZERO) {
      weights[userId] = weightVal;
    }
  }

  if (Object.keys(weights).length === 0) {
    // Fall back to equal split across allMembers
    return splitExpenseWithLargestRemainder(
      amountPaisa,
      { type: "equal", participants: allMembers },
      allMembers
    );
  }

  return splitWeighted(amountPaisa, weights);
}

/**
 * Largest-remainder distribution for integer weights.
 */
function splitWeighted(
  amountPaisa: bigint,
  weights: Record<string, bigint>
): Map<string, bigint> {
  const resultMap = new Map<string, bigint>();
  const entries = Object.entries(weights);
  const validEntries = entries.filter(([userId, weight]) => Boolean(userId) && weight > ZERO);
  const totalWeight = validEntries.reduce((acc, [, w]) => acc + w, ZERO);

  if (totalWeight <= ZERO) return resultMap;

  interface Candidate {
    userId: string;
    floorShare: bigint;
    remainder: bigint;
  }

  let totalFloor = ZERO;
  const candidates: Candidate[] = validEntries.map(([userId, weight]) => {
    const unscaled = amountPaisa * weight;
    const floorShare = unscaled / totalWeight;
    const remainder = unscaled % totalWeight;
    totalFloor += floorShare;
    return { userId, floorShare, remainder };
  });

  const deficit = Number(amountPaisa - totalFloor);

  // Sort descending by remainder, tie-breaking deterministically by userId
  candidates.sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder > a.remainder ? 1 : -1;
    }
    return a.userId.localeCompare(b.userId);
  });

  candidates.forEach((cand, index) => {
    const extra = index < deficit ? ONE : ZERO;
    resultMap.set(cand.userId, cand.floorShare + extra);
  });

  return resultMap;
}

/**
 * Computes net balances for each member from a list of group expenses.
 * Invariant: sum of all member balances is ALWAYS BigInt(0).
 */
export function compute_balances(
  expenses: GroupExpense[],
  members: string[]
): Record<string, bigint> {
  const balances = new Map<string, bigint>();

  // Ensure every member is initialized with ZERO
  for (const memberId of members) {
    balances.set(memberId, ZERO);
  }

  for (const expense of expenses) {
    const payer = expense.paid_by;
    const totalAmount = BigInt(expense.amount_paisa);

    // Expenses from a non-member cannot be reconciled against this trip's
    // member balances. Ignore the invalid row instead of creating a phantom
    // creditor and breaking the zero-sum invariant.
    if (totalAmount <= ZERO || !balances.has(payer)) continue;

    // Credit payer
    balances.set(payer, (balances.get(payer) || ZERO) + totalAmount);

    // Debit each split participant using largest-remainder rule
    const shares = splitExpenseWithLargestRemainder(
      totalAmount,
      expense.split,
      members
    );

    Array.from(shares.entries()).forEach(([userId, sharePaisa]) => {
      balances.set(userId, (balances.get(userId) || ZERO) - sharePaisa);
    });
  }

  // Convert map to plain record
  const result: Record<string, bigint> = {};
  Array.from(balances.entries()).forEach(([userId, bal]) => {
    result[userId] = bal;
  });

  return result;
}

/**
 * Minimises transfers to settle all debts with the smallest number of transactions.
 * Uses greedy cash-flow minimization with integer paisa.
 */
export function minimise_transfers(balances: Record<string, bigint>): Transfer[] {
  interface Party {
    userId: string;
    amount: bigint;
  }

  const debtors: Party[] = [];
  const creditors: Party[] = [];

  for (const [userId, balance] of Object.entries(balances)) {
    if (balance < ZERO) {
      debtors.push({ userId, amount: -balance });
    } else if (balance > ZERO) {
      creditors.push({ userId, amount: balance });
    }
  }

  // Sort descending by amount for greedy resolution
  debtors.sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : a.userId.localeCompare(b.userId)));
  creditors.sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : a.userId.localeCompare(b.userId)));

  const transfers: Transfer[] = [];
  let debtorIdx = 0;
  let creditorIdx = 0;

  while (debtorIdx < debtors.length && creditorIdx < creditors.length) {
    const debtor = debtors[debtorIdx];
    const creditor = creditors[creditorIdx];

    const settleAmount = debtor.amount < creditor.amount ? debtor.amount : creditor.amount;

    if (settleAmount > ZERO) {
      transfers.push({
        from: debtor.userId,
        to: creditor.userId,
        amount_paisa: settleAmount,
      });

      debtor.amount -= settleAmount;
      creditor.amount -= settleAmount;
    }

    if (debtor.amount === ZERO) debtorIdx++;
    if (creditor.amount === ZERO) creditorIdx++;
  }

  return transfers;
}
