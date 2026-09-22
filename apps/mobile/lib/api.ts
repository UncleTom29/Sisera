import { SiseraClient } from "@sisera/api-client";

const baseUrl =
  typeof process !== "undefined" && process.env.SISERA_API_URL
    ? process.env.SISERA_API_URL
    : "http://localhost:8000";

export const api = new SiseraClient(baseUrl);
