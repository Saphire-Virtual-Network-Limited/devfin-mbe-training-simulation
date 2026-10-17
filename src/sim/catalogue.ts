import { ADMIN_FEE, type Device } from "./data";
import { BRANDS, DEVICES } from "./devices";
import { minDown } from "./scoring";

export { BRANDS, DEVICES };

export const deviceById = (id: string | null | undefined): Device => DEVICES.find((d) => d.id === id) ?? DEVICES[0];
export const brandLabel = (key: string): string => BRANDS.find((b) => b.key === key)?.label ?? key;
export const deviceLabel = (d: Device): string => `${brandLabel(d.brand)} ${d.name}`;
export const devicesIn = (lo: number, hi: number, brand?: string): Device[] =>
  DEVICES.filter((d) => d.price >= lo && d.price <= hi && (!brand || d.brand === brand));
/** Minimum down payment plus admin fee: what the customer must pay today. */
export const payNowFor = (d: Device): number => minDown(d.price) + ADMIN_FEE;
