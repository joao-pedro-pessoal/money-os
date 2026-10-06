/**
 * Every word of the translated parts of the app, in each language.
 *
 * `en` is the source and the type: `pt` is checked against it, so a sentence
 * added in English and not in Portuguese fails the build instead of showing
 * up half-translated. What is not translated yet — most pages beyond the
 * menus, sign-in, quick entry and Settings — is still written in place, in
 * English; it moves here page by page.
 *
 * Text marked `**like this**` is drawn bold by `components/Rich.tsx`.
 *
 * Never translated, anywhere: what is yours (account, category and shop
 * names), amounts, and currency codes. Those come from your data, not from
 * here.
 *
 * Pure.
 */
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/accounts/password";
import type { Language } from "./languages";

const en = {
  nav: {
    dashboard: "Dashboard",
    analytics: "Analytics",
    accounts: "Accounts",
    cashFlow: "Cash Flow",
    savings: "Savings",
    budgets: "Budgets",
    buckets: "Buckets",
    subscriptions: "Subscriptions",
    comingIn: "Coming in",
    library: "Library",
    investments: "Investments",
    manual: "Manual",
    settings: "Settings",
    home: "Home",
    /** The bottom bar on a phone has room for one short word. */
    invest: "Invest",
    cashFlowShort: "Cash flow",
    more: "More",
    morePages: "More pages",
    findPage: "Find a page",
    searchPages: "Search pages…",
    noPages: "No pages found. Try another name.",
    pagesFound: (n: number) => `${n} ${n === 1 ? "page" : "pages"} found`,
    clearSearch: "Clear page search",
    logOut: "Log out",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    showValues: "Show values",
    hideValues: "Hide values (Privacy Mode)",
    switchLight: "Switch to light",
    switchDark: "Switch to dark",
    quickNavigation: "Quick navigation",
    relatedPages: "Related pages",
    settingsPages: "Settings pages",
    groupMoney: "Money",
    groupLearning: "Learning",
    groupNotGuaranteed: "Not guaranteed",
  },

  /**
   * Names of pages and tabs, by their English name. Tabs are defined once in
   * `lib/navigation.ts` and drawn by every page that has them; looking them up
   * by name translates them all without touching a page.
   */
  labels: {} as Record<string, string>,

  /**
   * Messages the server writes, in English, by their English text: shown in
   * the chosen language when they are known here, as written when not.
   */
  server: {} as Record<string, string>,

  language: {
    label: "Language",
  },

  auth: {
    heroBefore: "Your money, ",
    heroAccent: "in one place.",
    oneViewTitle: "Everything in one view",
    oneViewText: "Accounts, cash flow, budgets and investments — what you have and where it went.",
    yoursTitle: "Yours alone",
    yoursText: "Your own account. What you record is kept apart from everyone else's, and no other user can see it.",
    phoneTitle: "On your phone too",
    phoneText: "Open it in your phone's browser and add it to the home screen: it installs like an app.",
    footer: "Private by design. Open source, under the AGPL.",
    unreachable: "The server could not be reached. Try again in a moment.",
    locked: (time: string) => `Too many wrong attempts. Try again at ${time}.`,
    writeEmailAndPassword: "Write your email and your password.",
    noMatch: "That email and password do not match.",
    writeEmail: "Write your email.",
    writeEmailAndCode: "Write your email and your recovery code.",
    codeNoMatch: "That email and recovery code do not match.",
    email: "Email",
    password: "Password",
    showPassword: "Show the password",
    hidePassword: "Hide the password",
    show: "Show",
    hide: "Hide",
    codeTitle: "Your recovery code",
    codeText:
      "Write it down, or keep it in a password manager. If you ever forget your password, this code is how you set a new one — and nobody, including whoever runs this site, can give it back to you.",
    savedIt: "I have saved it",
    continue: "Continue",
    signUpTitle: "Create your account",
    signUpText: "Your own Money OS: everything in it is yours alone.",
    newPasswordHint: `At least ${PASSWORD_MIN} characters. A long one: it guards your money records.`,
    createMyAccount: "Create my account",
    creating: "Creating it…",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
    recoverTitle: "A new password",
    recoverText:
      "With the recovery code you were given when the account was made. It is used up, and you get a new one.",
    recoveryCode: "Recovery code",
    newPassword: "New password",
    atLeast: `At least ${PASSWORD_MIN} characters.`,
    setPassword: "Set the new password",
    setting: "Setting it…",
    remembered: "Remembered it?",
    signInText: "With your email and password.",
    forgot: "Forgot your password?",
    signingIn: "Signing in…",
    newHere: "New here?",
    createAnAccount: "Create an account",
  },

  install: {
    installed: "Installed — you are using Money OS as an app on this device.",
    justInstalled: "Installed. Open Money OS from its icon on your home screen.",
    androidApp: "You are in the Money OS Android app.",
    pitchTitle: "Use it like an app.",
    pitchText: "Install Money OS on this phone or computer — no store, no download.",
    button: "Install app",
    insecureSteps: "This Wi-Fi address cannot install the app. Open the published site over HTTPS in a supported browser, then install it there. A bookmark here does not provide app shortcuts or the offline page.",
    unsupportedSteps: "This browser cannot install this site as an app on a computer. Open it in Chrome or Edge to install it.",
    publishedSite: "Open the published site →",
    iosSteps:
      "In Safari, tap **Share** (the square with an arrow), then **Add to Home Screen**, then **Add**. Money OS then opens from its own icon.",
    menuSteps:
      "Open your browser's menu (**⋮** or **⋯**) and choose **Install app** or **Add to Home screen**. On a computer, Chrome and Edge also show an install icon at the end of the address bar.",
  },

  legal: {
    privacy: "Privacy",
    terms: "Terms",
    deletion: "Delete account",
    privacyNotice: "Privacy notice",
    termsOfUse: "Terms of use",
    agreeStart: "By creating an account you accept the ",
    agreeAnd: " and the ",
    agreeEnd: ".",
    settingsTitle: "Privacy and terms",
    settingsText:
      "What is kept about you and who handles it, the terms of use, and how to delete the account, from inside the app or out of it.",
    back: "Money OS",
    pages: "Legal pages",
  },

  quickEntry: {
    open: "Quick entry",
    openTitle: "Add income or expense",
    button: "Add entry",
    title: "Quick entry",
    close: "Close quick entry",
    noAccounts: "Add an account before recording income or expenses.",
    addAccount: "Add an account",
    undone: "Entry undone. The account balance has been restored.",
    saved: "Entry saved.",
    savingsLink: "Savings / cashback",
    undo: "Undo",
    undoing: "Undoing…",
    done: "Done",
    kind: "Transaction type",
    expense: "Expense",
    income: "Income",
    amount: (currency: string | null) => (currency ? `Amount (${currency})` : "Amount"),
    account: "Account",
    details: "Details · category, note and date",
    category: "Category",
    noCategory: "No category",
    description: "Description",
    optional: "Optional",
    date: "Date",
    saving: "Saving…",
    saveExpense: "Save expense",
    saveIncome: "Save income",
    saveFailed:
      "Could not confirm the save. Retry with the same details, or check Cash Flow before starting another entry.",
    undoFailed: "Could not confirm the undo. You can retry safely.",
    savingsSummary: "Purchase savings · discount and cashback",
    savingsIntro:
      "Expenses only, in the purchase currency. Amount is what you actually paid. A cashback deducted at checkout is a discount.",
    discount: "Discount / money saved",
    originalPrice: "Or original price",
    originalPriceHint: "Optional — leave discount blank to calculate",
    cashback: "Total cashback expected",
    savingsAfter:
      "After saving, open Savings to link cashback already received or record its receipt. For a return, correct the retained discount and expected cashback here; record the actual refund separately.",
  },

  settings: {
    title: "Settings",
    save: "Save",
    appTitle: "App on this device",
    appText:
      "Money OS has no store or download: your browser installs it, with its own icon on the home screen. Shortcuts and widgets are explained under On your phone.",
    phoneLink: "On your phone: install, shortcuts, widgets →",
    languageTitle: "Language",
    languageText:
      "The language of the app. Your account, category and shop names and your amounts are never translated. Some pages are still only in English.",
    baseTitle: "Base currency",
    baseText:
      "Every total in the app is converted to this. Individual accounts keep their own currency — only the summed figures change.",
    favouritesTitle: "Favourite currencies",
    favouritesText:
      "Offered as a one-click view on the dashboard. Switching there converts what you see — the base currency above is still what every total is stored and compared in.",
    baseMark: " (base)",
    saveFavourites: "Save favourites",
    dashboardCurrencyTitle: "Dashboard currency",
    dashboardCurrencyText:
      "The dashboard opens in this. Everywhere else stays in the base currency, so this doesn't change what the app stores — only what that one page renders.",
    sameAsBase: (currency: string) => `Same as base (${currency})`,
    defaultAccountTitle: "Default account",
    defaultAccountText:
      "Where a new transaction starts. Almost every hand-entered one comes from the same place — cash, usually, since that is the account no connector fills in for you.",
    noDefault: "No default — pick every time",
    appearanceTitle: "Appearance",
    appearanceText: "Each theme has a light and a dark variant.",
    windowsTitle: "Analysis windows",
    windowsText:
      "Choose which analysis detail appears, and whether it starts open or minimized. Other app sections with a header can also be minimized by clicking that header.",
    accountTitle: "Your account",
    accountText:
      "The recovery code is how you set a new password if you forget this one. Make a new one if you have lost it, or if someone may have seen it.",
    devicesTitle: "Signed-in devices",
    devicesText:
      "Each phone and browser that logs in stays signed in until it has gone 30 days without being used. If a phone is lost, or someone may have seen your session, end them all: every other device has to enter the password again, and this one stays signed in.",
    lastDone: (when: string) => ` Last done ${when}.`,
    logOutOthers: "Log out other devices",
    importTitle: "Import a bank statement",
    importText:
      "Your bank's format doesn't matter — copy the instruction, paste it into any AI with your statement, and upload what comes back.",
    open: "Open →",
    windowShowOpen: "Show open",
    windowShowMinimized: "Show minimized",
    windowHide: "Hide",
    saveDashboard: "Save dashboard",
    windows: {
      "portfolio-returns": "Time and money weighted return",
      "gain-attribution": "Where the gains came from",
      contributions: "Money added versus money made",
    } as Record<string, string>,
    accent: "Accent",
    accents: { gold: "Gold", emerald: "Emerald", indigo: "Indigo", mono: "Monochrome" } as Record<string, string>,
    signal: "Colour that means something",
    signalNone: "None",
    signalNoneText: "A gain is brighter, a loss dimmer. Survives printing.",
    signalColour: "Green, red and assets",
    signalColourText: "The page stays black and white; only the parts that mean something get hue.",
    mode: "Mode",
    dark: "Dark",
    light: "Light",
    quickNotificationTitle: "Record an expense from outside the app",
    quickNotificationText:
      "A notification that stays in the notification shade, with Expense and Income buttons that open the quick entry form. The home-screen widget and the shortcuts on the app icon (touch and hold it) do the same and need nothing switched on.",
    quickNotificationToggle: "Quick entry notification",
    alertsTitle: "Alerts on this phone",
    alertsText:
      "A notification for what the bell would show you: a budget over or running ahead, a subscription about to charge or waiting to be confirmed, a balance not updated in two months, a connection that stopped syncing, a watchlist price reached. Each one once. The phone checks about every half hour, whenever it can reach this site: anywhere with internet for the published site, or on the same Wi-Fi for a copy running on your computer.",
    alertsToggle: "Alert notifications",
  },

  account: {
    signedInAs: "Signed in as",
    newCodeTitle: "Your new recovery code — write it down now",
    newCodeNote: "The old one no longer works. This one is not shown again.",
    yourPassword: "Your password",
    checking: "Checking…",
    makeCode: "Make the new code",
    cancel: "Cancel",
    newCode: "New recovery code",
    writePassword: "Write your password.",
    notThisPassword: "That is not this account's password.",
    tooMany: "Too many wrong attempts. Try again later.",
    unreachable: "The server could not be reached. Try again in a moment.",
    notThisPasswordNothingDeleted: "That is not this account's password. Nothing was deleted.",
    unreachableNothingDeleted: "The server could not be reached. Nothing was deleted.",
    deleteWarning:
      "This deletes your account and everything in it — accounts, movements, investments, budgets, all of it. It cannot be undone, and nobody can bring it back.",
    typeEmail: "Type your email",
    deleting: "Deleting…",
    deleteMine: "Delete my account",
    deleteStart: "Delete my account…",
  },

  phone: {
    installTitle: "1 · Install Money OS",
    installText:
      "Use the published HTTPS address to install with a supported browser. The home Wi-Fi address (HTTP) only allows a bookmark, without app shortcuts or the offline page. The published app works anywhere with internet and updates when a new version is published.",
    shortcutsTitle: "2 · Shortcuts on the icon",
    shortcutsAndroid:
      "**Android:** touch and hold the **Money OS** icon. A list opens with **Record expense**, **Record income**, **Cash Flow** and **Investments**.",
    shortcutsDrag:
      "To keep one on the home screen, touch and hold it in that list and drag it out. It becomes an icon of its own: one tap and the quick entry form is open, ready for the amount.",
    shortcutsIphone:
      "**iPhone:** Safari gives installed sites no shortcuts, so the icon opens the dashboard. The **+ Add entry** button on every page opens the same form.",
    shortcutsLater:
      "Installed before the shortcuts existed? The phone adds them by itself once Chrome refreshes the app, which happens within a day or so of opening it.",
    tryExpense: "Try: record expense",
    tryIncome: "Try: record income",
    nothingSaved: "Nothing is saved until you press Save in the form.",
    widgetsTitle: "3 · Widgets",
    widgetsText:
      "A browser cannot put widgets on the home screen — not Chrome, not Safari, on any phone — and this app is installed by the browser, so it has none.",
    widgetsMore:
      "The widgets (net worth, cash flow, investments and others) belong to the separate Android app in android-shell/, which is installed from a file and today reaches the computer that runs Money OS over the home Wi-Fi. On the installed app, the closest thing is a shortcut above: one tap from the home screen to the form.",
  },
};

/** Every word, in the shape English gives it. */
export type Messages = typeof en;

const pt: Messages = {
  nav: {
    dashboard: "Painel",
    analytics: "Análise",
    accounts: "Contas",
    cashFlow: "Movimentos",
    savings: "Poupanças",
    budgets: "Orçamentos",
    buckets: "Objetivos",
    subscriptions: "Subscrições",
    comingIn: "A receber",
    library: "Biblioteca",
    investments: "Investimentos",
    manual: "Manual",
    settings: "Definições",
    home: "Início",
    invest: "Carteira",
    cashFlowShort: "Movimentos",
    more: "Mais",
    morePages: "Mais páginas",
    findPage: "Encontrar página",
    searchPages: "Pesquisar páginas…",
    noPages: "Nenhuma página encontrada. Experimenta outro nome.",
    pagesFound: (n: number) => `${n} ${n === 1 ? "página encontrada" : "páginas encontradas"}`,
    clearSearch: "Limpar a pesquisa",
    logOut: "Sair",
    openMenu: "Abrir menu",
    closeMenu: "Fechar menu",
    showValues: "Mostrar valores",
    hideValues: "Esconder valores (modo privacidade)",
    switchLight: "Mudar para claro",
    switchDark: "Mudar para escuro",
    quickNavigation: "Navegação rápida",
    relatedPages: "Páginas relacionadas",
    settingsPages: "Páginas das definições",
    groupMoney: "Dinheiro",
    groupLearning: "Aprender",
    groupNotGuaranteed: "Sem garantia",
  },

  labels: {
    Dashboard: "Painel",
    Analytics: "Análise",
    Accounts: "Contas",
    "Cash Flow": "Movimentos",
    Savings: "Poupanças",
    Budgets: "Orçamentos",
    Buckets: "Objetivos",
    Subscriptions: "Subscrições",
    "Coming in": "A receber",
    Library: "Biblioteca",
    Investments: "Investimentos",
    Manual: "Manual",
    Settings: "Definições",
    "Import statement": "Importar extrato",
    Overview: "Resumo",
    "Where it goes": "Para onde vai",
    "Trends & projections": "Tendências e projeções",
    Reports: "Relatórios",
    "What you owe": "O que deves",
    "Interest received": "Juros recebidos",
    Holdings: "Posições",
    Analysis: "Análise",
    "Trade history": "Histórico de negócios",
    Playlists: "Listas",
    Watchlist: "A seguir",
    Dividends: "Dividendos",
    "Open positions": "Posições abertas",
    Connections: "Ligações",
    General: "Geral",
    Categories: "Categorias",
    "Currency & rates": "Moeda e câmbios",
    "Your data": "Os teus dados",
    "On your phone": "No telemóvel",
  },

  server: {
    "Enter a positive amount with at most two decimal places.": "Escreve um valor positivo com, no máximo, duas casas decimais.",
    "Choose a valid date.": "Escolhe uma data válida.",
    "Original price must be at least the amount paid.": "O preço original não pode ser inferior ao valor pago.",
    "Discount and original price describe different savings. Enter just one, or make them agree.": "O desconto e o preço original indicam poupanças diferentes. Preenche só um ou corrige os valores.",
    "Discounts and expected cashback belong to expenses only.": "Os descontos e o cashback previsto só se aplicam a despesas.",
    "Your session has expired. Sign in again.": "A tua sessão terminou. Entra outra vez.",
    "Invalid transaction type.": "Tipo de movimento inválido.",
    "Purchase not found.": "Compra não encontrada.",
    "Choose an active account.": "Escolhe uma conta ativa.",
    "Choose a category for this transaction type.": "Escolhe uma categoria para este tipo de movimento.",
    "This request was already saved with different details. Check Cash Flow before adding another.": "Este pedido já foi guardado com outros dados. Confirma nos Movimentos antes de acrescentar outro.",
    "Choose a purchase, not another cashback movement.": "Escolhe uma compra, não outro movimento de cashback.",
    "Cashback needs an income receipt or an expense reversal.": "O cashback precisa de uma receita ou da devolução de uma despesa.",
    "Choose a cashback movement in the purchase currency.": "Escolhe um movimento de cashback na moeda da compra.",
    "A purchase with savings cannot also be a cashback receipt.": "Uma compra com poupanças não pode também ser um recebimento de cashback.",
    "This movement is already linked to another purchase. Unlink it first.": "Este movimento já está associado a outra compra. Remove primeiro essa associação.",
    "The server is busy with other sign-ins. Try again in a moment.":
      "O servidor está ocupado com outras entradas. Tenta outra vez daqui a pouco.",
    "An account with this email already exists. Sign in instead.":
      "Já existe uma conta com este email. Entra com ela.",
    "Write a valid email address.": "Escreve um endereço de email válido.",
    "Sign in again.": "Entra outra vez.",
    "The owner's account holds everything from before accounts, and is not deleted from here.":
      "A conta do dono guarda tudo o que existia antes das contas, e não se apaga aqui.",
    "Type your account's email exactly, to confirm.": "Escreve o email da tua conta exatamente igual, para confirmar.",
    "New accounts are closed on this site.": "Este site não está a aceitar contas novas.",
    "This site is not taking new accounts at the moment.": "Este site não está a aceitar contas novas de momento.",
    "Too many new accounts recently. Try again later.": "Foram criadas demasiadas contas há pouco. Tenta mais tarde.",
    [`Use a password of at least ${PASSWORD_MIN} characters.`]: `Usa uma palavra-passe com pelo menos ${PASSWORD_MIN} caracteres.`,
    [`Use a password of at most ${PASSWORD_MAX} characters.`]: `Usa uma palavra-passe com no máximo ${PASSWORD_MAX} caracteres.`,
    "Close and reopen Quick entry to start again.": "Fecha e volta a abrir o registo rápido para recomeçar.",
    "Choose income or expense.": "Escolhe receita ou despesa.",
  },

  language: {
    label: "Idioma",
  },

  auth: {
    heroBefore: "O teu dinheiro, ",
    heroAccent: "num só lugar.",
    oneViewTitle: "Tudo numa só vista",
    oneViewText: "Contas, movimentos, orçamentos e investimentos — o que tens e para onde foi.",
    yoursTitle: "Só teu",
    yoursText: "A tua própria conta. O que registas fica separado do de toda a gente, e mais nenhum utilizador o vê.",
    phoneTitle: "Também no telemóvel",
    phoneText: "Abre-o no navegador do telemóvel e adiciona-o ao ecrã principal: instala-se como uma app.",
    footer: "Privado de raiz. Código aberto, com a licença AGPL.",
    unreachable: "Não foi possível contactar o servidor. Tenta outra vez daqui a pouco.",
    locked: (time: string) => `Demasiadas tentativas erradas. Tenta outra vez às ${time}.`,
    writeEmailAndPassword: "Escreve o teu email e a tua palavra-passe.",
    noMatch: "Esse email e essa palavra-passe não correspondem.",
    writeEmail: "Escreve o teu email.",
    writeEmailAndCode: "Escreve o teu email e o teu código de recuperação.",
    codeNoMatch: "Esse email e esse código de recuperação não correspondem.",
    email: "Email",
    password: "Palavra-passe",
    showPassword: "Mostrar a palavra-passe",
    hidePassword: "Esconder a palavra-passe",
    show: "Mostrar",
    hide: "Esconder",
    codeTitle: "O teu código de recuperação",
    codeText:
      "Escreve-o num papel ou guarda-o num gestor de palavras-passe. Se um dia esqueceres a palavra-passe, é com este código que escolhes uma nova — e ninguém, nem quem gere este site, to pode devolver.",
    savedIt: "Já o guardei",
    continue: "Continuar",
    signUpTitle: "Cria a tua conta",
    signUpText: "O teu próprio Money OS: tudo o que lá está é só teu.",
    newPasswordHint: `Pelo menos ${PASSWORD_MIN} caracteres. Uma longa: protege os teus registos de dinheiro.`,
    createMyAccount: "Criar a minha conta",
    creating: "A criar…",
    haveAccount: "Já tens conta?",
    signIn: "Entrar",
    recoverTitle: "Uma palavra-passe nova",
    recoverText: "Com o código de recuperação que recebeste ao criar a conta. Fica gasto e recebes um novo.",
    recoveryCode: "Código de recuperação",
    newPassword: "Palavra-passe nova",
    atLeast: `Pelo menos ${PASSWORD_MIN} caracteres.`,
    setPassword: "Guardar a palavra-passe nova",
    setting: "A guardar…",
    remembered: "Lembraste-te?",
    signInText: "Com o teu email e a tua palavra-passe.",
    forgot: "Esqueceste a palavra-passe?",
    signingIn: "A entrar…",
    newHere: "És novo aqui?",
    createAnAccount: "Criar uma conta",
  },

  install: {
    installed: "Instalada — estás a usar o Money OS como app neste aparelho.",
    justInstalled: "Instalada. Abre o Money OS pelo ícone no ecrã principal.",
    androidApp: "Estás na app Android do Money OS.",
    pitchTitle: "Usa-o como uma app.",
    pitchText: "Instala o Money OS neste telemóvel ou computador — sem loja, sem download.",
    button: "Instalar app",
    insecureSteps: "Este endereço de Wi-Fi não permite instalar a app. Abre o site publicado por HTTPS num navegador compatível e instala-a lá. Um marcador aqui não dá atalhos da app nem a página sem ligação.",
    unsupportedSteps: "Este navegador não permite instalar este site como app no computador. Abre-o no Chrome ou no Edge para o instalar.",
    publishedSite: "Abrir o site publicado →",
    iosSteps:
      "No Safari, toca em **Partilhar** (o quadrado com uma seta), depois em **Adicionar ao ecrã principal** e em **Adicionar**. O Money OS passa a abrir pelo seu próprio ícone.",
    menuSteps:
      "Abre o menu do navegador (**⋮** ou **⋯**) e escolhe **Instalar app** ou **Adicionar ao ecrã principal**. No computador, o Chrome e o Edge também mostram um ícone de instalar no fim da barra de endereço.",
  },

  legal: {
    privacy: "Privacidade",
    terms: "Termos",
    deletion: "Apagar conta",
    privacyNotice: "Política de privacidade",
    termsOfUse: "Termos de utilização",
    agreeStart: "Ao criar a conta, aceitas os ",
    agreeAnd: " e a ",
    agreeEnd: ".",
    settingsTitle: "Privacidade e termos",
    settingsText:
      "O que é guardado sobre ti e quem lhe toca, os termos de utilização, e como apagar a conta, dentro ou fora da app.",
    back: "Money OS",
    pages: "Páginas legais",
  },

  quickEntry: {
    open: "Registo rápido",
    openTitle: "Registar uma receita ou despesa",
    button: "Registar",
    title: "Registo rápido",
    close: "Fechar o registo rápido",
    noAccounts: "Adiciona uma conta (banco, dinheiro…) antes de registar receitas ou despesas.",
    addAccount: "Adicionar uma conta",
    undone: "Registo anulado. O saldo da conta foi reposto.",
    saved: "Registo guardado.",
    savingsLink: "Poupanças / cashback",
    undo: "Anular",
    undoing: "A anular…",
    done: "Feito",
    kind: "Tipo de movimento",
    expense: "Despesa",
    income: "Receita",
    amount: (currency: string | null) => (currency ? `Valor (${currency})` : "Valor"),
    account: "Conta",
    details: "Detalhes · categoria, nota e data",
    category: "Categoria",
    noCategory: "Sem categoria",
    description: "Descrição",
    optional: "Opcional",
    date: "Data",
    saving: "A guardar…",
    saveExpense: "Guardar despesa",
    saveIncome: "Guardar receita",
    saveFailed:
      "Não foi possível confirmar que ficou guardado. Tenta outra vez com os mesmos dados, ou vê os Movimentos antes de começar outro registo.",
    undoFailed: "Não foi possível confirmar a anulação. Podes tentar outra vez sem risco.",
    savingsSummary: "Poupança na compra · desconto e cashback",
    savingsIntro:
      "Só despesas, na moeda da compra. O valor é o que pagaste de facto. Um cashback descontado no pagamento é um desconto.",
    discount: "Desconto / dinheiro poupado",
    originalPrice: "Ou preço original",
    originalPriceHint: "Opcional — deixa o desconto em branco para o calcular",
    cashback: "Cashback total esperado",
    savingsAfter:
      "Depois de guardar, abre as Poupanças para ligar um cashback já recebido ou registar quando chegar. Numa devolução, corrige aqui o desconto e o cashback esperado; regista o reembolso à parte.",
  },

  settings: {
    title: "Definições",
    save: "Guardar",
    appTitle: "App neste aparelho",
    appText:
      "O Money OS não tem loja nem download: é o navegador que o instala, com o seu próprio ícone no ecrã principal. Os atalhos e os widgets estão explicados em No telemóvel.",
    phoneLink: "No telemóvel: instalar, atalhos, widgets →",
    languageTitle: "Idioma",
    languageText:
      "A língua da app. Os nomes das tuas contas, categorias e lojas e os teus valores nunca são traduzidos. Algumas páginas ainda só estão em inglês.",
    baseTitle: "Moeda base",
    baseText:
      "Todos os totais da app são convertidos para esta moeda. Cada conta mantém a sua — só mudam os valores somados.",
    favouritesTitle: "Moedas favoritas",
    favouritesText:
      "Aparecem no painel para veres tudo noutra moeda com um clique. Mudar lá só converte o que vês — os totais continuam guardados e comparados na moeda base.",
    baseMark: " (base)",
    saveFavourites: "Guardar favoritas",
    dashboardCurrencyTitle: "Moeda do painel",
    dashboardCurrencyText:
      "O painel abre nesta moeda. O resto da app fica na moeda base, por isso isto não muda o que a app guarda — só o que essa página mostra.",
    sameAsBase: (currency: string) => `Igual à base (${currency})`,
    defaultAccountTitle: "Conta por defeito",
    defaultAccountText:
      "A conta com que um movimento novo começa. Quase tudo o que registas à mão sai do mesmo sítio — normalmente o dinheiro vivo, que nenhuma ligação preenche por ti.",
    noDefault: "Nenhuma — escolher sempre",
    appearanceTitle: "Aspeto",
    appearanceText: "Cada tema tem uma versão clara e uma escura.",
    windowsTitle: "Janelas de análise",
    windowsText:
      "Escolhe que detalhes de análise aparecem e se começam abertos ou minimizados. As outras secções com cabeçalho também se minimizam clicando no cabeçalho.",
    accountTitle: "A tua conta",
    accountText:
      "O código de recuperação serve para escolheres uma palavra-passe nova se esqueceres esta. Cria um novo se o perdeste ou se alguém o pode ter visto.",
    devicesTitle: "Aparelhos com sessão iniciada",
    devicesText:
      "Cada telemóvel e navegador onde entras fica com a sessão iniciada até passar 30 dias sem ser usado. Se perderes um telemóvel, ou se alguém pode ter visto a tua sessão, termina-as todas: os outros aparelhos têm de voltar a pôr a palavra-passe, e este continua com a sessão iniciada.",
    lastDone: (when: string) => ` Última vez: ${when}.`,
    logOutOthers: "Terminar a sessão nos outros aparelhos",
    importTitle: "Importar um extrato bancário",
    importText:
      "O formato do teu banco não importa — copia a instrução, cola-a numa IA qualquer com o teu extrato e carrega o que ela devolver.",
    open: "Abrir →",
    windowShowOpen: "Mostrar aberta",
    windowShowMinimized: "Mostrar minimizada",
    windowHide: "Esconder",
    saveDashboard: "Guardar painel",
    windows: {
      "portfolio-returns": "Rentabilidade ponderada no tempo e pelo dinheiro",
      "gain-attribution": "De onde vieram os ganhos",
      contributions: "Dinheiro posto versus dinheiro ganho",
    },
    accent: "Cor",
    accents: { gold: "Dourado", emerald: "Esmeralda", indigo: "Índigo", mono: "Monocromático" },
    signal: "Cor com significado",
    signalNone: "Nenhuma",
    signalNoneText: "Um ganho fica mais claro, uma perda mais escura. Resiste à impressão.",
    signalColour: "Verde, vermelho e ativos",
    signalColourText: "A página fica a preto e branco; só o que tem significado ganha cor.",
    mode: "Modo",
    dark: "Escuro",
    light: "Claro",
    quickNotificationTitle: "Registar uma despesa fora da app",
    quickNotificationText:
      "Uma notificação que fica na barra de notificações, com os botões Despesa e Receita, que abrem o registo rápido. O widget do ecrã principal e os atalhos do ícone da app (carrega uns segundos nele) fazem o mesmo e não precisam de nada ligado.",
    quickNotificationToggle: "Notificação de registo rápido",
    alertsTitle: "Alertas neste telemóvel",
    alertsText:
      "Uma notificação para o que o sino te mostraria: um orçamento ultrapassado ou a gastar depressa demais, uma subscrição prestes a cobrar ou à espera de confirmação, um saldo sem atualização há dois meses, uma ligação que deixou de sincronizar, um preço da lista A seguir atingido. Cada um uma vez. O telemóvel verifica mais ou menos de meia em meia hora, sempre que consegue chegar a este site: em qualquer lado com internet no site publicado, ou no mesmo Wi-Fi numa cópia a correr no teu computador.",
    alertsToggle: "Notificações de alertas",
  },

  account: {
    signedInAs: "Sessão iniciada como",
    newCodeTitle: "O teu novo código de recuperação — escreve-o já",
    newCodeNote: "O antigo deixou de funcionar. Este não volta a ser mostrado.",
    yourPassword: "A tua palavra-passe",
    checking: "A verificar…",
    makeCode: "Criar o código novo",
    cancel: "Cancelar",
    newCode: "Novo código de recuperação",
    writePassword: "Escreve a tua palavra-passe.",
    notThisPassword: "Essa não é a palavra-passe desta conta.",
    tooMany: "Demasiadas tentativas erradas. Tenta mais tarde.",
    unreachable: "Não foi possível contactar o servidor. Tenta outra vez daqui a pouco.",
    notThisPasswordNothingDeleted: "Essa não é a palavra-passe desta conta. Nada foi apagado.",
    unreachableNothingDeleted: "Não foi possível contactar o servidor. Nada foi apagado.",
    deleteWarning:
      "Isto apaga a tua conta e tudo o que está nela — contas, movimentos, investimentos, orçamentos, tudo. Não se pode desfazer, e ninguém o pode recuperar.",
    typeEmail: "Escreve o teu email",
    deleting: "A apagar…",
    deleteMine: "Apagar a minha conta",
    deleteStart: "Apagar a minha conta…",
  },

  phone: {
    installTitle: "1 · Instalar o Money OS",
    installText:
      "Usa o endereço publicado por HTTPS para instalar num navegador compatível. O endereço de casa pelo Wi-Fi (HTTP) só permite um marcador, sem atalhos da app nem a página sem ligação. A app publicada funciona em qualquer lado com internet e atualiza-se quando sai uma versão nova.",
    shortcutsTitle: "2 · Atalhos no ícone",
    shortcutsAndroid:
      "**Android:** carrega uns segundos no ícone **Money OS**. Abre uma lista com **Record expense**, **Record income**, **Cash Flow** e **Investments**.",
    shortcutsDrag:
      "Para ficar com um no ecrã principal, carrega uns segundos nele dessa lista e arrasta-o para fora. Fica um ícone próprio: um toque e o registo rápido abre logo, pronto para o valor.",
    shortcutsIphone:
      "**iPhone:** o Safari não dá atalhos aos sites instalados, por isso o ícone abre o painel. O botão **+ Registar** em todas as páginas abre o mesmo formulário.",
    shortcutsLater:
      "Instalaste antes de haver atalhos? O telemóvel acrescenta-os sozinho quando o Chrome atualizar a app, o que acontece num dia ou dois depois de a abrires.",
    tryExpense: "Experimentar: registar despesa",
    tryIncome: "Experimentar: registar receita",
    nothingSaved: "Nada fica gravado até carregares em Guardar no formulário.",
    widgetsTitle: "3 · Widgets",
    widgetsText:
      "Um navegador não consegue pôr widgets no ecrã principal — nem o Chrome, nem o Safari, em nenhum telemóvel — e esta app é instalada pelo navegador, por isso não tem.",
    widgetsMore:
      "Os widgets (património, movimentos, investimentos e outros) são da app Android à parte, em android-shell/, que se instala a partir de um ficheiro e hoje chega ao computador que corre o Money OS pelo Wi-Fi de casa. Na app instalada, o mais parecido é um atalho acima: um toque do ecrã principal até ao formulário.",
  },
};

const MESSAGES: Record<Language, Messages> = { en, pt };

export function messagesFor(language: Language): Messages {
  return MESSAGES[language];
}

/** A page or tab name in the chosen language, or as written when it has no translation. */
export function labelIn(messages: Messages, label: string): string {
  return messages.labels[label] ?? label;
}

/** A message from the server in the chosen language, when it is one this file knows. */
export function serverMessageIn(messages: Messages, message: string): string {
  return messages.server[message] ?? message;
}
