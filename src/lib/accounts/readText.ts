export function readText(language: string) {
  const pt = language === "pt";
  return {
    limited: (seconds: number) => pt ? `Demasiados pedidos. Tenta novamente dentro de ${seconds} segundos.` : `Too many requests. Try again in ${seconds} seconds.`,
    unavailable: pt ? "Os alertas estão temporariamente indisponíveis. Tenta novamente dentro de instantes." : "Alerts are temporarily unavailable. Try again shortly.",
    dataUnavailable: pt ? "Os dados estão temporariamente indisponíveis. Tenta novamente dentro de instantes." : "Data is temporarily unavailable. Try again shortly.",
    pdfFailed: pt ? "Não foi possível criar o PDF. Tenta novamente." : "The PDF could not be made. Try again.",
    pdfRange: pt ? "Escolhe um intervalo mais curto para o PDF." : "Choose a shorter date range for the PDF.",
    pdfRows: pt ? "Este relatório ultrapassa os limites de geração PDF. Usa a exportação CSV." : "This report exceeds the PDF generation limits. Use the CSV export.",
    invalid: pt ? "Os parâmetros do relatório são inválidos. Volta à página do relatório." : "Invalid report parameters. Return to the report page.",
    session: pt ? "A sessão terminou. Volta a entrar." : "Your session ended. Sign in again.",
  };
}
