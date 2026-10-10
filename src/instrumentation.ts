import type { Instrumentation } from "next";
import { serverErrorEvent } from "@/lib/operations/serverError";

/** Sanitized operational event; no headers, URL, body, message, stack or user id. */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  console.error(JSON.stringify({ at: new Date().toISOString(), ...serverErrorEvent(error, request.method, context.routeType) }));
};
