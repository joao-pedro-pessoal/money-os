/**
 * The privacy notice, the terms and how to delete an account: the three pages
 * an app store asks for, and the ones a person signing up is entitled to read
 * first.
 *
 * Every sentence here is a claim about how the app behaves, so it is written
 * from the code, not from what such pages usually say. When the app changes —
 * a new provider, a new field, a new place data goes — this file changes with
 * it, and `LEGAL_UPDATED` moves. `docs/LEGAL_SECURITY_CHECKLIST.md` lists what
 * must never be claimed; the tests check the worst of it.
 *
 * Pure: who runs the site arrives as an argument (`operatorFrom` reads it from
 * the environment), so the same text is testable without a server.
 */
import type { Language } from "@/lib/i18n/languages";
import type { LegalKind } from "./paths";

export { LEGAL_KINDS, LEGAL_PATHS, type LegalKind } from "./paths";

/** The day the text last changed in substance. */
export const LEGAL_UPDATED = "2026-10-06";

/** Who runs this copy of Money OS, and how to reach them. Either may be unset. */
export interface Operator {
  name: string | null;
  email: string | null;
}

export interface LegalSection {
  heading: string;
  /** `**bold**` as in Rich; addresses and https links are made clickable by the page. */
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  updatedLabel: string;
  sections: LegalSection[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * `OPERATOR_NAME` and `CONTACT_EMAIL`, trimmed. An email that is not one is
 * treated as unset rather than printed: a privacy page must not tell people to
 * write to something that cannot receive.
 */
export function operatorFrom(env: { [name: string]: string | undefined }): Operator {
  const name = env.OPERATOR_NAME?.trim() || null;
  const email = env.CONTACT_EMAIL?.trim() || null;
  return { name, email: email && EMAIL.test(email) ? email : null };
}

export function legalDocument(kind: LegalKind, language: Language, operator: Operator): LegalDocument {
  const text = language === "pt" ? pt(operator) : en(operator);
  return text[kind];
}

/** "6 October 2026" / "6 de outubro de 2026". */
export function updatedOn(language: Language): string {
  const [y, m, d] = LEGAL_UPDATED.split("-").map(Number);
  const months =
    language === "pt"
      ? ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
      : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return language === "pt" ? `${d} de ${months[m - 1]} de ${y}` : `${d} ${months[m - 1]} ${y}`;
}

const CNPD = "https://www.cnpd.pt";

function en(op: Operator): Record<LegalKind, LegalDocument> {
  const who = op.name ? `${op.name}, a private individual in Portugal` : "a private individual in Portugal";
  const write = op.email
    ? `write to ${op.email}`
    : "write to the contact address on Money OS's Google Play page";
  return {
    privacy: {
      title: "Privacy notice",
      intro:
        "What Money OS keeps about you, why, who else handles it, and how to get it back or have it erased. Written for this app as it works today, in plain words.",
      updatedLabel: "Last updated",
      sections: [
        {
          heading: "Who is responsible",
          paragraphs: [
            `Money OS is run by ${who}, who decides how your data is used (the "controller" under the GDPR). For anything on this page, ${write}.`,
          ],
        },
        {
          heading: "What is kept",
          paragraphs: [
            "**Your account:** your email address; a scrambled form (a hash) of a key your device derives from your password — the password itself never leaves your device; a hash of your recovery code; when the account was made; and how many wrong passwords were typed lately, to stop guessing.",
            "**What you put in:** the accounts, balances, movements, categories, budgets, investments, notes and other records you type in or import, and the name and a fingerprint (hash) of each file you import, so the same statement is not imported twice. The rows read from an imported file are kept; the file itself is not.",
            "**Wallet addresses** you add to follow a public blockchain account, such as a Hyperliquid address.",
            "**Broker API keys are not accepted on the published site.** Connections that need a key only work on a copy of Money OS that you run on your own computer.",
            "**In your browser or the app:** a sign-in cookie (it lasts until the account goes 30 days unused), a cookie with your language, and display preferences such as the theme and which panels are open, kept in the browser's own storage.",
            "**Technical records:** like every website, the hosting provider records requests — IP address, time, page asked for — and keeps them for a short time to run and protect the service.",
          ],
        },
        {
          heading: "What is not done with it",
          paragraphs: [
            "No advertising, no analytics or tracking services, no selling or sharing for marketing, no profiling, and no use of your records to train AI. Money OS does not move money and does not give investment advice.",
          ],
        },
        {
          heading: "Why, and on what basis",
          paragraphs: [
            "To give you the service you signed up for — keeping and showing your records — which is the performance of our agreement (GDPR article 6(1)(b)).",
            "To keep the service secure and working — the technical records and the limits on wrong passwords — which is a legitimate interest (article 6(1)(f)).",
          ],
        },
        {
          heading: "Who else handles it",
          paragraphs: [
            "**Vercel** runs the website. **Neon** runs the database, on Amazon Web Services servers in Frankfurt, Germany, where the data is stored encrypted. Both act on our instructions only. Vercel is a US company, so some processing can involve the United States, under the safeguards the GDPR requires for such transfers (the EU–US Data Privacy Framework and the European Commission's standard contractual clauses).",
            "To show prices, exchange rates and logos, the server asks market-data services such as Yahoo Finance, Stooq and Frankfurter, Parqet's logo service and coins' own websites about the symbols and currencies involved. They are not told who is asking.",
            "In the Library, your browser plays videos from YouTube in its privacy-enhanced mode; YouTube sees your IP address and which video was asked for. Links to brokers and other sites open them under their own terms and privacy policies.",
          ],
        },
        {
          heading: "Who can see your records",
          paragraphs: [
            "No other user. The database itself keeps each person's rows apart, so another account cannot read yours even by mistake in the app's code.",
            "The person who runs the site administers the database and so has technical access to it. That access is used only to keep the service running, to fix a problem you report, or where the law requires it. Your records are not end-to-end encrypted, and no system is perfectly secure.",
          ],
        },
        {
          heading: "How long it is kept",
          paragraphs: [
            "For as long as your account exists. Deleting the account erases everything in it at once. The database provider keeps a short rolling history so it can recover from failures, and copies there disappear as that history moves on, within days. Hosting records expire on their own in the same way.",
          ],
        },
        {
          heading: "Your rights",
          paragraphs: [
            "You can see and correct everything in the app itself. **Settings → Your data** gives you a full copy (a backup file, and CSV for movements and holdings). **Settings → Your account → Delete my account** erases the account and everything in it; how to do that without the app is on the page on deleting your account.",
            `You may also ask for access, correction, erasure, restriction or a copy of your data, or object to its use: ${write}. You will get an answer within one month. You can complain to the Portuguese data protection authority, the CNPD (${CNPD}), or the one where you live.`,
          ],
        },
        {
          heading: "Age",
          paragraphs: ["Money OS is for adults. Do not make an account if you are under 18."],
        },
        {
          heading: "Changes",
          paragraphs: [
            "When this notice changes, the date at the top changes with it. A change that affects what is kept or who handles it is announced in the app before it takes effect.",
          ],
        },
      ],
    },
    terms: {
      title: "Terms of use",
      intro: "The agreement between you and whoever runs this site, when you make a Money OS account.",
      updatedLabel: "Last updated",
      sections: [
        {
          heading: "What Money OS is",
          paragraphs: [
            `Money OS is a tool for recording and organising money you already have: accounts, spending, budgets and investments. It is provided by ${who}.`,
            "**It is read-only.** It cannot buy, sell, transfer or withdraw money. It is not a bank, a broker, a custodian or an investment adviser, and nothing in it is a recommendation to buy, sell or hold anything.",
          ],
        },
        {
          heading: "The figures",
          paragraphs: [
            "Prices, exchange rates and anything imported come from other sources and may be late, incomplete or wrong. A price or rate the app does not have is shown as unknown, not as zero. Check with your bank or broker before deciding anything on the strength of a figure here.",
          ],
        },
        {
          heading: "Your account",
          paragraphs: [
            "One account per person, with an email address you can use. Keep your password and your recovery code safe: nobody, including whoever runs this site, can tell you either of them, and an account whose password and recovery code are both lost cannot be opened again.",
            "You are responsible for what you record. Do not use Money OS to break the law, to reach anyone else's data, to overload or attack the service, or to make accounts automatically.",
          ],
        },
        {
          heading: "Free, and still being tested",
          paragraphs: [
            "Money OS is free. It is being tested and will change: features may be added, changed or removed, and the service may pause or end. Before it ends, you will be told in the app with time to download your data.",
          ],
        },
        {
          heading: "Responsibility",
          paragraphs: [
            "The service is provided as it is, with care but without a promise that it is always available or free of errors. As far as the law allows, whoever runs it is not liable for losses from decisions made using it. Nothing here limits a responsibility the law does not allow to be limited, or your rights as a consumer.",
          ],
        },
        {
          heading: "Ending",
          paragraphs: [
            "You can delete your account at any time, which erases everything in it. An account used against these terms may be closed; except where that would be unsafe or unlawful, you will be told why and given the chance to download your data first.",
          ],
        },
        {
          heading: "Open source",
          paragraphs: [
            "Money OS is free software under the GNU Affero General Public License, version 3. The source code is public; the Manual, inside the app, links to it.",
          ],
        },
        {
          heading: "Law, and changes to these terms",
          paragraphs: [
            "These terms are governed by Portuguese law. If you live elsewhere in the European Union, you keep the protection of your own country's consumer law.",
            "When these terms change, the date at the top changes. A change that affects you is announced in the app before it takes effect; if you do not accept it, you can delete your account.",
            `Questions: ${write}.`,
          ],
        },
      ],
    },
    deletion: {
      title: "Delete your Money OS account",
      intro:
        "How to erase your Money OS account and everything in it — from the app, from any browser, or, if you can no longer sign in, by asking.",
      updatedLabel: "Last updated",
      sections: [
        {
          heading: "From the app or any browser",
          paragraphs: [
            "1. Sign in to Money OS — the app, or the website in any browser.",
            "2. Open **Settings**, and under **Your account** press **Delete my account…**",
            "3. Type your email and your password, and confirm.",
            "The account is erased at once. Uninstalling the app does **not** delete the account.",
          ],
        },
        {
          heading: "If you cannot sign in",
          paragraphs: [
            "If you have lost your password, the recovery code you were given when you made the account sets a new one: **Forgot your password?** on the sign-in page.",
            `If you have lost both, ${write} from the email address of the account, asking for it to be deleted. You may be asked to confirm that the address is yours. The account is deleted within 30 days, and you are told when it has been.`,
          ],
        },
        {
          heading: "What is deleted",
          paragraphs: [
            "Everything: the sign-in, every account, balance, movement, category, budget, investment, connection, note and setting in it. Nothing is kept by Money OS afterwards.",
            "The database provider's short recovery history and the hosting provider's request records expire on their own, within days.",
          ],
        },
      ],
    },
  };
}

function pt(op: Operator): Record<LegalKind, LegalDocument> {
  // "por" joins "o" as "pelo": the sentence needs the preposition with the name.
  const byWho = op.name ? `por ${op.name}, particular, em Portugal` : "pelo particular, em Portugal, que gere este site";
  const write = op.email
    ? `escreve para ${op.email}`
    : "escreve para o endereço de contacto da página da Money OS no Google Play";
  return {
    privacy: {
      title: "Política de privacidade",
      intro:
        "O que a Money OS guarda sobre ti, porquê, quem mais lhe toca, e como o recuperar ou apagar. Escrita para a app tal como funciona hoje, em palavras simples.",
      updatedLabel: "Última atualização",
      sections: [
        {
          heading: "Quem é responsável",
          paragraphs: [
            `A Money OS é gerida ${byWho}, que decide como os teus dados são usados (o "responsável pelo tratamento", no RGPD). Para qualquer assunto desta página, ${write}.`,
          ],
        },
        {
          heading: "O que é guardado",
          paragraphs: [
            "**A tua conta:** o teu email; uma forma baralhada (um hash) de uma chave que o teu aparelho deriva da tua palavra-passe — a palavra-passe nunca sai do teu aparelho; um hash do teu código de recuperação; quando a conta foi criada; e quantas palavras-passe erradas foram escritas há pouco, para travar tentativas de adivinhar.",
            "**O que registas:** as contas, saldos, movimentos, categorias, orçamentos, investimentos, notas e outros registos que escreves ou importas, e o nome e uma impressão digital (hash) de cada ficheiro que importas, para o mesmo extrato não entrar duas vezes. Ficam as linhas lidas de um ficheiro importado; o ficheiro em si não.",
            "**Endereços de carteiras** que acrescentas para acompanhar uma conta pública numa blockchain, como um endereço Hyperliquid.",
            "**O site publicado não aceita chaves de API de corretoras.** As ligações que precisam de chave só funcionam numa cópia da Money OS a correr no teu próprio computador.",
            "**No teu navegador ou na app:** um cookie de sessão (dura até a conta passar 30 dias sem uso), um cookie com a tua língua, e preferências de apresentação, como o tema e os painéis abertos, guardadas no armazenamento do próprio navegador.",
            "**Registos técnicos:** como em qualquer site, o fornecedor de alojamento regista os pedidos — endereço IP, hora, página pedida — e guarda-os pouco tempo, para manter e proteger o serviço.",
          ],
        },
        {
          heading: "O que não é feito com eles",
          paragraphs: [
            "Sem publicidade, sem serviços de estatísticas ou de rastreio, sem venda nem partilha para marketing, sem perfis, e sem usar os teus registos para treinar IA. A Money OS não movimenta dinheiro nem dá conselhos de investimento.",
          ],
        },
        {
          heading: "Porquê, e com que fundamento",
          paragraphs: [
            "Para te prestar o serviço que pediste ao criar a conta — guardar e mostrar os teus registos —, ou seja, a execução do nosso acordo (artigo 6.º, n.º 1, alínea b) do RGPD).",
            "Para manter o serviço seguro e a funcionar — os registos técnicos e o limite de palavras-passe erradas —, um interesse legítimo (alínea f) do mesmo artigo).",
          ],
        },
        {
          heading: "Quem mais lhes toca",
          paragraphs: [
            "A **Vercel** corre o site. A **Neon** corre a base de dados, em servidores da Amazon Web Services em Frankfurt, na Alemanha, onde os dados ficam guardados cifrados. Ambas atuam só segundo as nossas instruções. A Vercel é uma empresa dos EUA, por isso parte do tratamento pode envolver os Estados Unidos, com as garantias que o RGPD exige para essas transferências (o Quadro de Privacidade de Dados UE–EUA e as cláusulas contratuais-tipo da Comissão Europeia).",
            "Para mostrar preços, câmbios e logótipos, o servidor pergunta a serviços de dados de mercado, como o Yahoo Finance, o Stooq e o Frankfurter, ao serviço de logótipos da Parqet e aos sites das próprias criptomoedas pelos símbolos e moedas em causa. Não lhes é dito quem pergunta.",
            "Na Biblioteca, o teu navegador reproduz vídeos do YouTube no modo de privacidade melhorada; o YouTube vê o teu endereço IP e o vídeo pedido. As ligações para corretoras e outros sites abrem-nos com os termos e políticas de privacidade deles.",
          ],
        },
        {
          heading: "Quem pode ver os teus registos",
          paragraphs: [
            "Nenhum outro utilizador. A própria base de dados separa as linhas de cada pessoa, por isso outra conta não consegue ler as tuas, nem por um erro no código da app.",
            "Quem gere o site administra a base de dados e tem, por isso, acesso técnico a ela. Esse acesso só é usado para manter o serviço a funcionar, para corrigir um problema que comuniques, ou quando a lei o exige. Os teus registos não têm cifragem de ponta a ponta, e nenhum sistema é perfeitamente seguro.",
          ],
        },
        {
          heading: "Durante quanto tempo",
          paragraphs: [
            "Enquanto a tua conta existir. Apagar a conta apaga tudo o que está nela de imediato. O fornecedor da base de dados guarda um histórico curto e contínuo para recuperar de avarias, e as cópias que lá estejam desaparecem à medida que esse histórico avança, em poucos dias. Os registos do alojamento expiram sozinhos da mesma forma.",
          ],
        },
        {
          heading: "Os teus direitos",
          paragraphs: [
            "Podes ver e corrigir tudo na própria app. Em **Definições → Os teus dados** tens uma cópia completa (um ficheiro de backup, e CSV para movimentos e posições). Em **Definições → A tua conta → Apagar a minha conta** apagas a conta e tudo o que está nela; como o fazer sem a app está na página sobre apagar a conta.",
            `Podes também pedir acesso, retificação, apagamento, limitação ou uma cópia dos teus dados, ou opor-te ao seu uso: ${write}. Tens resposta no prazo de um mês. Podes apresentar queixa à Comissão Nacional de Proteção de Dados, a CNPD (${CNPD}), ou à autoridade do país onde vives.`,
          ],
        },
        {
          heading: "Idade",
          paragraphs: ["A Money OS é para adultos. Não cries uma conta se tiveres menos de 18 anos."],
        },
        {
          heading: "Alterações",
          paragraphs: [
            "Quando esta política muda, a data no topo muda com ela. Uma alteração ao que é guardado ou a quem lhe toca é anunciada na app antes de entrar em vigor.",
          ],
        },
      ],
    },
    terms: {
      title: "Termos de utilização",
      intro: "O acordo entre ti e quem gere este site, quando crias uma conta Money OS.",
      updatedLabel: "Última atualização",
      sections: [
        {
          heading: "O que é a Money OS",
          paragraphs: [
            `A Money OS é uma ferramenta para registar e organizar o dinheiro que já tens: contas, gastos, orçamentos e investimentos. É disponibilizada ${byWho}.`,
            "**Só lê.** Não compra, não vende, não transfere nem levanta dinheiro. Não é um banco, uma corretora, um custodiante nem um consultor de investimento, e nada nela é uma recomendação para comprar, vender ou manter o que quer que seja.",
          ],
        },
        {
          heading: "Os valores",
          paragraphs: [
            "Preços, câmbios e o que é importado vêm de outras fontes e podem estar atrasados, incompletos ou errados. Um preço ou câmbio que a app não tem aparece como desconhecido, não como zero. Confirma com o teu banco ou corretora antes de decidir alguma coisa com base num valor daqui.",
          ],
        },
        {
          heading: "A tua conta",
          paragraphs: [
            "Uma conta por pessoa, com um email que possas usar. Guarda bem a palavra-passe e o código de recuperação: ninguém, nem quem gere este site, te pode dizer qualquer um deles, e uma conta cuja palavra-passe e código de recuperação se perderam não pode voltar a ser aberta.",
            "És responsável pelo que registas. Não uses a Money OS para violar a lei, para chegar aos dados de outra pessoa, para sobrecarregar ou atacar o serviço, nem para criar contas de forma automática.",
          ],
        },
        {
          heading: "Gratuita, e ainda em testes",
          paragraphs: [
            "A Money OS é gratuita. Está em testes e vai mudar: funcionalidades podem ser acrescentadas, alteradas ou retiradas, e o serviço pode parar ou terminar. Antes de terminar, és avisado na app, com tempo para descarregares os teus dados.",
          ],
        },
        {
          heading: "Responsabilidade",
          paragraphs: [
            "O serviço é prestado tal como está, com cuidado mas sem a promessa de estar sempre disponível ou sem erros. Na medida em que a lei o permite, quem o gere não responde por perdas resultantes de decisões tomadas com base nele. Nada aqui limita uma responsabilidade que a lei não permite limitar, nem os teus direitos enquanto consumidor.",
          ],
        },
        {
          heading: "Fim",
          paragraphs: [
            "Podes apagar a tua conta quando quiseres, o que apaga tudo o que está nela. Uma conta usada contra estes termos pode ser encerrada; salvo quando isso for inseguro ou ilegal, és informado do motivo e tens oportunidade de descarregar os teus dados antes.",
          ],
        },
        {
          heading: "Código aberto",
          paragraphs: [
            "A Money OS é software livre, com a licença GNU Affero General Public License, versão 3. O código é público; o Manual, dentro da app, tem a ligação.",
          ],
        },
        {
          heading: "Lei aplicável, e alterações a estes termos",
          paragraphs: [
            "Estes termos regem-se pela lei portuguesa. Se vives noutro país da União Europeia, manténs a proteção da lei do consumidor do teu país.",
            "Quando estes termos mudam, a data no topo muda. Uma alteração que te afete é anunciada na app antes de entrar em vigor; se não a aceitares, podes apagar a tua conta.",
            `Dúvidas: ${write}.`,
          ],
        },
      ],
    },
    deletion: {
      title: "Apagar a tua conta Money OS",
      intro:
        "Como apagar a tua conta Money OS e tudo o que está nela — na app, em qualquer navegador, ou, se já não consegues entrar, pedindo.",
      updatedLabel: "Última atualização",
      sections: [
        {
          heading: "Na app ou em qualquer navegador",
          paragraphs: [
            "1. Entra na Money OS — na app, ou no site em qualquer navegador.",
            "2. Abre **Definições** e, em **A tua conta**, carrega em **Apagar a minha conta…**",
            "3. Escreve o teu email e a tua palavra-passe, e confirma.",
            "A conta é apagada de imediato. Desinstalar a app **não** apaga a conta.",
          ],
        },
        {
          heading: "Se não consegues entrar",
          paragraphs: [
            "Se perdeste a palavra-passe, o código de recuperação que recebeste ao criar a conta define uma nova: **Esqueceste a palavra-passe?** na página de entrada.",
            `Se perdeste as duas coisas, ${write} a partir do email da conta, a pedir que seja apagada. Podemos pedir-te que confirmes que o endereço é teu. A conta é apagada no prazo de 30 dias, e és avisado quando estiver.`,
          ],
        },
        {
          heading: "O que é apagado",
          paragraphs: [
            "Tudo: o acesso, e todas as contas, saldos, movimentos, categorias, orçamentos, investimentos, ligações, notas e definições. A Money OS não guarda nada depois.",
            "O histórico curto de recuperação do fornecedor da base de dados e os registos de pedidos do alojamento expiram sozinhos, em poucos dias.",
          ],
        },
      ],
    },
  };
}
