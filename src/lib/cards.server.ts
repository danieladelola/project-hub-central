// Fictional card data only — NOT real, usable payment cards.
export const CARD_FEE_MINOR = 500n; // $5.00
const PREFIX = { visa: "400000", mastercard: "555555" } as const;

function randDigits(n: number) {
  const b = new Uint32Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => String(x % 10)).join("");
}
export function luhnCheckDigit(partial: string) {
  let sum = 0;
  for (let i = 0; i < partial.length; i++) {
    let d = Number(partial[partial.length - 1 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}
export function generateCard(brand: "visa" | "mastercard", now = new Date()) {
  const partial = PREFIX[brand] + randDigits(9);
  return { number: partial + luhnCheckDigit(partial), cvv: randDigits(3), expMonth: now.getUTCMonth() + 1, expYear: now.getUTCFullYear() + 3 };
}
