export const MIN_AMOUNT_MINOR_UNITS = 1;
export const MAX_AMOUNT_MINOR_UNITS = 1_000_000;

export function isValidMinorUnitAmount(amount: number): boolean {
  return (
    Number.isSafeInteger(amount) &&
    amount >= MIN_AMOUNT_MINOR_UNITS &&
    amount <= MAX_AMOUNT_MINOR_UNITS
  );
}
