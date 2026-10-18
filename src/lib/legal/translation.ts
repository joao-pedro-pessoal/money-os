/** Keep instructions tied to the exact labels on the buttons they describe. */
export function legalTemplate(text: string): string {
  const labels: Record<string, string> = {
    "Settings": "settings", "Your account": "account", "Delete my account…": "deleteAccount",
    "Forgot your password?": "forgot", "Your data": "yourData", "Delete my account": "deleteAccount",
  };
  return text.replace(/\*\*([^*]+)\*\*/g, (_match, label: string) =>
    `**${label.split(" → ").map(part => labels[part] ? `{${labels[part]}}` : part).join(" → ")}**`);
}
