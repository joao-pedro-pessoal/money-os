import InstallApp from "./InstallApp";
import LanguagePicker from "./LanguagePicker";
import { currentLanguage, words } from "@/actions/language";

/**
 * The frame of the way in: signing in, making an account, recovering one. On a wide screen the left half says what this is; on a phone it
 * folds away and leaves the brand above the form.
 *
 * Painted from the theme's tokens only, so each of the eight themes gets its
 * own version of it, the light ones included.
 */
export default async function AuthFrame({ children }: { children: React.ReactNode }) {
  const language = await currentLanguage();
  const w = (await words()).auth;
  return (
    <div translate="no" lang={language} className="app-frame grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="auth-hero hidden lg:flex flex-col justify-between gap-10 p-12 xl:p-16">
        {/* First, so everything after it is drawn on top. */}
        <Trend />

        <Brand />

        <div className="relative space-y-8 max-w-lg">
          {/* Not the page's heading: that is the form's, which a phone still shows. */}
          <p
            style={{ fontFamily: "var(--font-heading)" }}
            className="text-4xl xl:text-5xl leading-[1.1] tracking-tight text-[var(--foreground)]"
          >
            {w.heroBefore}
            <span className="text-[var(--accent)]">{w.heroAccent}</span>
          </p>
          <ul className="space-y-5">
            <Point title={w.oneViewTitle} icon={<IconChart />}>
              {w.oneViewText}
            </Point>
            <Point title={w.yoursTitle} icon={<IconLock />}>
              {w.yoursText}
            </Point>
            <Point title={w.phoneTitle} icon={<IconPhone />}>
              {w.phoneText}
            </Point>
          </ul>
        </div>

        <p className="relative text-xs text-[var(--muted)]">{w.footer}</p>
      </aside>

      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md space-y-8">
          {/* Before signing in there is no Settings page: the language is chosen here. */}
          <div className="flex items-center justify-between gap-4">
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="ml-auto">
              <LanguagePicker className="input w-auto py-1 text-sm" />
            </div>
          </div>
          {children}
          <InstallApp compact />
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="relative flex items-center gap-3">
      <span className="auth-mark" aria-hidden="true">
        M
      </span>
      <span style={{ fontFamily: "var(--font-heading)" }} className="text-xl tracking-tight text-[var(--foreground)]">
        Money OS
      </span>
    </div>
  );
}

function Point({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="auth-point-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <div className="text-sm font-medium text-[var(--foreground)]">{title}</div>
        <p className="text-sm text-[var(--muted)] leading-relaxed">{children}</p>
      </div>
    </li>
  );
}

/** A rising line, drawn rather than measured: decoration, so hidden from screen readers. */
function Trend() {
  return (
    <svg className="auth-trend" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="auth-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 104 L40 98 L80 101 L120 86 L160 90 L200 70 L240 74 L280 52 L320 46 L360 30 L400 18 L400 120 L0 120 Z"
        fill="url(#auth-trend-fill)"
      />
      <path
        d="M0 104 L40 98 L80 101 L120 86 L160 90 L200 70 L240 74 L280 52 L320 46 L360 30 L400 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconChart() {
  return (
    <svg {...iconProps}>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg {...iconProps}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}
