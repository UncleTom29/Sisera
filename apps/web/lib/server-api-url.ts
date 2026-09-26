/** The Next server talks to the API over the private loopback interface on the VPS. */
export function serverApiUrl(): string {
  return (
    process.env.SISERA_API_URL || `http://127.0.0.1:${process.env.API_PORT || "4000"}`
  ).replace(/\/$/, "");
}
