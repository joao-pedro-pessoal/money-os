/** New transfer feedback in the two launch languages; full edition falls back to English. */
export function transferText(language: string) {
  const pt = language === "pt";
  return {
    failed: pt ? "Não foi possível confirmar o resultado. Tenta novamente com os mesmos dados." : "Could not confirm the result. Retry with the same details.",
    retryImport: pt ? "Ligação interrompida. Tenta novamente com os mesmos dados; os movimentos guardados não serão duplicados." : "Connection interrupted. Retry with the same details; saved transactions will not be duplicated.",
    restored: pt ? "Cópia restaurada." : "Backup restored.",
    processing: pt ? "A processar…" : "Processing…",
    session: pt ? "A sessão terminou. Volta a entrar antes de continuar." : "Your session ended. Sign in again before continuing.",
    tooLarge: pt ? "O ficheiro ultrapassa o limite de upload." : "The file exceeds the upload limit.",
    limit: (bytes: number, rows: number) => pt ? `Limite: ${bytes / 1024 / 1024} MiB e ${rows.toLocaleString("pt-PT")} registos.` : `Limit: ${bytes / 1024 / 1024} MiB and ${rows.toLocaleString("en-GB")} rows.`,
    retryAfter: (seconds: number) => pt ? `Demasiados pedidos. Tenta novamente dentro de ${seconds} segundos.` : `Too many requests. Try again in ${seconds} seconds.`,
    validation: (message: string) => {
      if (!pt) return message;
      const invalid = /^Backup rejected: (invalid|missing) (\w+) in ([\w]+), row (\d+)\.$/.exec(message);
      if (invalid) return `Backup recusado: campo ${invalid[2]} ${invalid[1] === "missing" ? "em falta" : "inválido"} em ${invalid[3]}, linha ${invalid[4]}.`;
      if (message.includes("References must stay") || message.includes("references must stay")) return "Backup recusado: há referências a registos que não existem no ficheiro.";
      if (message.includes("row limit")) return "O backup ultrapassa o limite de registos.";
      if (message.includes("isn't valid JSON")) return "O ficheiro não contém JSON válido.";
      if (message.includes("upload limit")) return "O ficheiro ultrapassa o limite de upload.";
      if (message.includes("nested too deeply")) return "O ficheiro tem demasiados níveis de dados.";
      if (message.includes("CSV has too many")) return "O CSV ultrapassa o limite de linhas ou colunas.";
      if (message.includes("field") || message.includes("description") || message.includes("merchant")) return "O ficheiro contém um campo inválido ou demasiado longo.";
      if (message.includes("CSV exceeds")) return "O CSV ultrapassa o limite de tamanho.";
      if (message.includes("quoted") || message.includes("CSV could not be read")) return "Não foi possível ler o CSV. Verifica as colunas e as aspas.";
      if (message.includes("broker statement importer")) return "Este ficheiro deve ser usado no importador de extratos de corretoras.";
      if (message.includes("date and amount columns")) return "Escolhe colunas válidas para a data e o montante.";
      if (message.includes("amount")) return "O ficheiro contém um montante inválido. Usa no máximo duas casas decimais.";
      if (message.includes("different details") || message.includes("different file")) return "Este pedido já foi utilizado com dados diferentes. Seleciona o ficheiro novamente.";
      if (message.includes("was undone")) return "Esta importação foi anulada. Seleciona o ficheiro novamente para criar uma nova importação.";
      if (message.includes("duplicate key")) return "O backup contém identificadores de registos repetidos.";
      const missing = /^Missing table "([\w]+)"/.exec(message);
      if (missing) return `A tabela ${missing[1]} não existe no backup e ficará vazia.`;
      const unknown = /^Unknown table "([\w]+)"/.exec(message);
      if (unknown) return `A tabela ${unknown[1]} não é reconhecida e será ignorada.`;
      return "O ficheiro foi recusado. Verifica o formato e os dados antes de tentar novamente.";
    },
  };
}
