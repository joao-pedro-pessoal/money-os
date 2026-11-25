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
    fxFailed: pt ? "Não foi possível atualizar os câmbios. As taxas guardadas foram mantidas." : "Exchange rates could not be refreshed. Stored rates were kept.",
    fxUpdated: pt ? "Câmbios atualizados." : "Exchange rates refreshed.",
    fxUnconfirmed: pt ? "Não foi possível confirmar a atualização. Recarrega a página para ver as taxas atuais." : "The update could not be confirmed. Reload the page to check the current rates.",
    unpinned: pt ? "A taxa voltou ao modo automático." : "The rate is automatic again.",
    searchFailed: pt ? "A pesquisa online está indisponível. Podes pesquisar os ativos guardados ou escrever o ticker manualmente." : "Online search is unavailable. Your saved assets are still searchable; you can also type a ticker manually.",
    searchInvalid: pt ? "Escreve uma pesquisa com até 200 caracteres." : "Enter a search of up to 200 characters.",
    syncFailed: pt ? "Não foi possível concluir a sincronização. Tenta novamente." : "Sync could not be completed. Try again.",
    synced: pt ? "Sincronização concluída." : "Sync completed.",
    syncLimit: pt ? "Há demasiadas ligações para uma só sincronização. Sincroniza cada ligação separadamente." : "Too many connections for one sync. Sync each connection separately.",
  };
}
