import { describe, expect, it } from "vitest";
import { normalizeCode, normalizePhone, parseRosterCsv } from "./mbe-id";

describe("normalizeCode", () => {
  it("uppercases and trims", () => expect(normalizeCode("  mbe-e8cabf ")).toBe("MBE-E8CABF"));
  it.each(["", "ab", "MBE_E8", "<script>", "x".repeat(30)])("rejects %s", (v) => {
    expect(normalizeCode(v)).toBeNull();
  });
  it("rejects non-strings", () => expect(normalizeCode(42)).toBeNull());
});

describe("normalizePhone", () => {
  it.each([
    ["08031234567", "08031234567"],
    ["+234 803 123 4567", "08031234567"],
    ["2349061234567", "09061234567"],
    ["0703-123-4567", "07031234567"],
  ])("%s → %s", (input, out) => expect(normalizePhone(input)).toBe(out));
  it.each(["0803123456", "08031234567890", "06031234567", "abc", "+44 7700 900123"])("rejects %s", (v) => {
    expect(normalizePhone(v)).toBeNull();
  });
});

describe("parseRosterCsv", () => {
  it("reads rows, skips the header and reports bad lines", () => {
    const r = parseRosterCsv("code,phone,name,store\nmbe-1a2b,08031234567,Ada Obi,Ikeja\nMBE-1A2B,09061234567,Dup,X\nBAD CODE!,08031234567,X,Y\n\tMBE-9Z,07031234567,Musa Bello,\n");
    expect(r.entries).toEqual([
      { code: "MBE-1A2B", phone: "08031234567", name: "Ada Obi", store: "Ikeja" },
      { code: "MBE-9Z", phone: "07031234567", name: "Musa Bello", store: "" },
    ]);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatch(/more than once/);
  });
  it("accepts tab-separated rows pasted from a spreadsheet", () => {
    expect(parseRosterCsv("MBE-77\t08031234567\tKemi Lawal\tLekki").entries[0]?.code).toBe("MBE-77");
  });
  it("needs a name", () => {
    expect(parseRosterCsv("MBE-77,08031234567,,Lekki").errors[0]).toMatch(/name/);
  });
});
