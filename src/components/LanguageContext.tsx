"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const LANGUAGES = [
  ["en", "English"], ["pt", "Português"], ["es", "Español"], ["fr", "Français"],
  ["de", "Deutsch"], ["it", "Italiano"], ["nl", "Nederlands"], ["pl", "Polski"],
  ["tr", "Türkçe"], ["ja", "日本語"], ["ko", "한국어"], ["zh", "简体中文"],
] as const;
export type Language = (typeof LANGUAGES)[number][0];

type Labels = {
  dashboard: string; analytics: string; accounts: string; cashFlow: string; savings: string;
  budgets: string; buckets: string; subscriptions: string; comingIn: string; library: string;
  investments: string; manual: string; settings: string; home: string; morePages: string;
  findPage: string; searchPages: string; noPages: string; logOut: string; openMenu: string;
  closeMenu: string; showValues: string; hideValues: string; switchLight: string; switchDark: string;
  language: string; languageDescription: string; save: string; overview: string; manageAccount: string;
};

const english: Labels = {
  dashboard: "Dashboard", analytics: "Analytics", accounts: "Accounts", cashFlow: "Cash Flow",
  savings: "Savings", budgets: "Budgets", buckets: "Buckets", subscriptions: "Subscriptions",
  comingIn: "Coming in", library: "Library", investments: "Investments", manual: "Manual",
  settings: "Settings", home: "Home", morePages: "More pages", findPage: "Find a page",
  searchPages: "Search pages…", noPages: "No pages found. Try another name.", logOut: "Log out",
  openMenu: "Open menu", closeMenu: "Close menu", showValues: "Show values",
  hideValues: "Hide values (Privacy Mode)", switchLight: "Switch to light", switchDark: "Switch to dark",
  language: "Language", languageDescription: "Choose the language for the app interface. Your financial data stays unchanged.",
  save: "Save", overview: "Overview", manageAccount: "Manage account",
};

const translations: Partial<Record<Language, Partial<Labels>>> = {
  pt: { dashboard: "Painel", analytics: "Análise", accounts: "Contas", cashFlow: "Movimentos", savings: "Poupanças", budgets: "Orçamentos", buckets: "Objetivos", subscriptions: "Subscrições", comingIn: "A receber", library: "Biblioteca", investments: "Investimentos", manual: "Manual", settings: "Definições", home: "Início", morePages: "Mais páginas", findPage: "Encontrar página", searchPages: "Pesquisar páginas…", noPages: "Nenhuma página encontrada. Tente outro nome.", logOut: "Sair", openMenu: "Abrir menu", closeMenu: "Fechar menu", showValues: "Mostrar valores", hideValues: "Ocultar valores (privacidade)", switchLight: "Mudar para claro", switchDark: "Mudar para escuro", language: "Idioma", languageDescription: "Escolha o idioma da interface. Os seus dados financeiros não são alterados.", save: "Guardar", overview: "Resumo", manageAccount: "Gerir conta" },
  es: { dashboard: "Panel", analytics: "Análisis", accounts: "Cuentas", cashFlow: "Movimientos", savings: "Ahorros", budgets: "Presupuestos", buckets: "Objetivos", subscriptions: "Suscripciones", comingIn: "Por recibir", library: "Biblioteca", investments: "Inversiones", settings: "Ajustes", home: "Inicio", morePages: "Más páginas", findPage: "Buscar página", logOut: "Cerrar sesión", language: "Idioma", languageDescription: "Elige el idioma de la interfaz. Tus datos financieros no cambian.", save: "Guardar", overview: "Resumen", manageAccount: "Gestionar cuenta" },
  fr: { dashboard: "Tableau de bord", analytics: "Analyse", accounts: "Comptes", cashFlow: "Mouvements", savings: "Épargne", budgets: "Budgets", subscriptions: "Abonnements", library: "Bibliothèque", investments: "Investissements", settings: "Paramètres", home: "Accueil", findPage: "Rechercher une page", logOut: "Se déconnecter", language: "Langue", languageDescription: "Choisissez la langue de l’interface. Vos données financières restent inchangées.", save: "Enregistrer", overview: "Vue d’ensemble", manageAccount: "Gérer le compte" },
  de: { dashboard: "Übersicht", analytics: "Analyse", accounts: "Konten", cashFlow: "Zahlungen", savings: "Sparen", budgets: "Budgets", subscriptions: "Abos", library: "Bibliothek", investments: "Investitionen", settings: "Einstellungen", home: "Startseite", findPage: "Seite suchen", logOut: "Abmelden", language: "Sprache", languageDescription: "Wählen Sie die Sprache der Oberfläche. Ihre Finanzdaten bleiben unverändert.", save: "Speichern", overview: "Übersicht", manageAccount: "Konto verwalten" },
  it: { dashboard: "Pannello", analytics: "Analisi", accounts: "Conti", cashFlow: "Movimenti", savings: "Risparmi", budgets: "Budget", subscriptions: "Abbonamenti", library: "Biblioteca", investments: "Investimenti", settings: "Impostazioni", home: "Home", findPage: "Cerca pagina", logOut: "Esci", language: "Lingua", languageDescription: "Scegli la lingua dell’interfaccia. I dati finanziari non cambiano.", save: "Salva", overview: "Riepilogo", manageAccount: "Gestisci conto" },
  nl: { dashboard: "Dashboard", analytics: "Analyse", accounts: "Rekeningen", cashFlow: "Transacties", savings: "Sparen", budgets: "Budgetten", subscriptions: "Abonnementen", library: "Bibliotheek", investments: "Beleggingen", settings: "Instellingen", home: "Home", findPage: "Pagina zoeken", logOut: "Uitloggen", language: "Taal", languageDescription: "Kies de taal van de interface. Je financiële gegevens blijven hetzelfde.", save: "Opslaan", overview: "Overzicht", manageAccount: "Rekening beheren" },
  pl: { dashboard: "Panel", analytics: "Analiza", accounts: "Konta", cashFlow: "Transakcje", savings: "Oszczędności", budgets: "Budżety", subscriptions: "Subskrypcje", library: "Biblioteka", investments: "Inwestycje", settings: "Ustawienia", home: "Start", findPage: "Znajdź stronę", logOut: "Wyloguj", language: "Język", languageDescription: "Wybierz język interfejsu. Dane finansowe pozostają bez zmian.", save: "Zapisz", overview: "Podsumowanie", manageAccount: "Zarządzaj kontem" },
  tr: { dashboard: "Panel", analytics: "Analiz", accounts: "Hesaplar", cashFlow: "İşlemler", savings: "Birikimler", budgets: "Bütçeler", subscriptions: "Abonelikler", library: "Kütüphane", investments: "Yatırımlar", settings: "Ayarlar", home: "Ana sayfa", findPage: "Sayfa bul", logOut: "Çıkış yap", language: "Dil", languageDescription: "Arayüz dilini seçin. Finansal verileriniz değişmez.", save: "Kaydet", overview: "Genel bakış", manageAccount: "Hesabı yönet" },
  ja: { dashboard: "ダッシュボード", analytics: "分析", accounts: "口座", cashFlow: "取引", savings: "貯蓄", budgets: "予算", subscriptions: "サブスクリプション", library: "ライブラリ", investments: "投資", settings: "設定", home: "ホーム", findPage: "ページを検索", logOut: "ログアウト", language: "言語", languageDescription: "アプリの表示言語を選択します。金融データは変更されません。", save: "保存", overview: "概要", manageAccount: "口座を管理" },
  ko: { dashboard: "대시보드", analytics: "분석", accounts: "계정", cashFlow: "거래", savings: "저축", budgets: "예산", subscriptions: "구독", library: "라이브러리", investments: "투자", settings: "설정", home: "홈", findPage: "페이지 찾기", logOut: "로그아웃", language: "언어", languageDescription: "앱 인터페이스 언어를 선택합니다. 금융 데이터는 변경되지 않습니다.", save: "저장", overview: "개요", manageAccount: "계정 관리" },
  zh: { dashboard: "仪表板", analytics: "分析", accounts: "账户", cashFlow: "交易", savings: "储蓄", budgets: "预算", subscriptions: "订阅", library: "资料库", investments: "投资", settings: "设置", home: "首页", findPage: "查找页面", logOut: "退出登录", language: "语言", languageDescription: "选择应用界面语言。您的财务数据不会改变。", save: "保存", overview: "概览", manageAccount: "管理账户" },
};

const Ctx = createContext<{ language: Language; setLanguage: (language: Language) => void; t: Labels }>({ language: "en", setLanguage: () => {}, t: english });
const valid = (value: string | null): Language => LANGUAGES.some(([code]) => code === value) ? value as Language : "en";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  useEffect(() => { try { setLanguageState(valid(localStorage.getItem("moneyos_language"))); } catch {} }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const setLanguage = (next: Language) => { setLanguageState(next); try { localStorage.setItem("moneyos_language", next); } catch {} };
  const t = useMemo(() => ({ ...english, ...(translations[language] ?? {}) }), [language]);
  return <Ctx.Provider value={{ language, setLanguage, t }}>{children}</Ctx.Provider>;
}

export function useLanguage() { return useContext(Ctx); }
