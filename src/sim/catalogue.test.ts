import { describe, expect, it } from "vitest";
import { BRANDS, DEVICES, deviceById, devicesIn, payNowFor } from "./catalogue";
import { makeCustomer } from "./customer";
import { SCENARIOS } from "./scenarios";
import { minDown } from "./scoring";

/** Model counts and starting prices on the live "Choose a brand" screen, 17 Oct 2026. */
const LIVE_BRAND_SCREEN: [string, number, number][] = [
  ["TECNO", 73, 94900], ["Infinix", 69, 92800], ["Xiaomi", 57, 86900], ["Samsung", 132, 102500],
  ["itel", 67, 58700], ["Oppo", 35, 149900], ["Vivo", 29, 97000], ["Nokia", 11, 63240],
  ["Realme", 8, 110500], ["Huawei", 4, 176900], ["Zte", 4, 109500], ["Honor", 3, 436500],
  ["Nubia", 3, 157000], ["Poco", 3, 91300], ["Redmi", 2, 160165], ["Blade", 1, 98000],
];

describe("device catalogue", () => {
  it("matches the live brand screen: order, names, counts and starting prices", () => {
    const actual = BRANDS.map((b) => {
      const ds = DEVICES.filter((d) => d.brand === b.key);
      return [b.label, ds.length, Math.min(...ds.map((d) => d.price))];
    });
    expect(actual).toEqual(LIVE_BRAND_SCREEN);
  });
  it("has unique ids and positive prices", () => {
    expect(new Set(DEVICES.map((d) => d.id)).size).toBe(DEVICES.length);
    expect(DEVICES.every((d) => d.price > 0)).toBe(true);
  });
});

describe("generated customers", () => {
  it("can always afford the phone they ask for, except where the scenario says otherwise", () => {
    for (let i = 0; i < 200; i++) {
      for (const s of SCENARIOS) {
        const c = makeCustomer();
        s.setup(c);
        const want = deviceById(c.wants);
        expect(want.id).toBe(c.wants);
        if (s.id === "budget") {
          expect(payNowFor(want)).toBeGreaterThan(c.cash);
          const fallback = deviceById(c.fallback);
          expect(fallback.brand).toBe(want.brand);
          expect(payNowFor(fallback)).toBeLessThanOrEqual(c.cash);
        } else if (s.id === "smooth") {
          expect(minDown(want.price)).toBeLessThanOrEqual(30000);
          expect(30000 + 11000).toBeLessThanOrEqual(c.cash);
        } else if (s.notReady === undefined) {
          expect(payNowFor(want)).toBeLessThanOrEqual(c.cash);
        }
      }
    }
  });
  it("budget scenario always finds a brand with a premium and an everyday phone", () => {
    expect(BRANDS.some((b) => devicesIn(600000, Infinity, b.key).length && devicesIn(85000, 200000, b.key).length)).toBe(true);
  });
});
