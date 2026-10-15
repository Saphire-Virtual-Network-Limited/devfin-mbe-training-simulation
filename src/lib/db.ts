import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { databaseUrl } from "./env";

let client: NeonQueryFunction<false, false> | null = null;

/** Neon's HTTP driver: one short request per query, suited to serverless functions. */
export function sql(): NeonQueryFunction<false, false> {
  client ??= neon(databaseUrl());
  return client;
}
