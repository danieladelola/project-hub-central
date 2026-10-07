import { describe, expect, it } from "vitest";
import { CARD_FEE_MINOR, generateCard, luhnCheckDigit } from "@/lib/cards.server";

describe("virtual cards", () => {
  it("costs $5 to generate", () => expect(CARD_FEE_MINOR).toBe(500n));
  it("generates 16-digit fictional Visa test-range numbers", () => {
    const c = generateCard("visa");
    expect(c.number).toMatch(/^400000\d{10}$/);
    expect(luhnCheckDigit(c.number.slice(0, 15))).toBe(c.number[15]);
  });
  it("generates fictional Mastercard test-range numbers", () => expect(generateCard("mastercard").number).toMatch(/^555555\d{10}$/));
});
