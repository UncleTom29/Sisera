import { SiseraClient } from "@sisera/api-client";

const baseUrl =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_SISERA_API_URL ?? "")
    : (process.env.SISERA_API_URL ?? "http://127.0.0.1:8000");

export const api = new SiseraClient(baseUrl, "dev_trader_token");
