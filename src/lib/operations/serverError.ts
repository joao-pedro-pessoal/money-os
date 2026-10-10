/** Only fixed labels leave this function. Never serialize an Error or request. */
export function serverErrorEvent(error: unknown, method: string, routeType: string) {
  const name = error instanceof Error ? error.name : "";
  return {
    event: "moneyos.server_error",
    errorType: ["Error", "TypeError", "RangeError", "SyntaxError"].includes(name) ? name : "UnknownError",
    method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(method) ? method : "OTHER",
    routeType: ["render", "route", "action", "proxy"].includes(routeType) ? routeType : "unknown",
  };
}
