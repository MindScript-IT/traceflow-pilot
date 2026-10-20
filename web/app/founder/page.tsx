"use client";
import React, { useEffect, useState } from "react";
import { Fingerprint, Copy, Check, AlertCircle, KeyRound } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { apiFounderList, apiFounderMint, type FounderInvite } from "@/lib/api";

const TEXTS = {
  en: {
    title: "Founder console",
    subtitle: "Generate invite codes for pilot companies",
    founderKey: "Founder key",
    founderKeyHint: "Stored in this tab only. Never sent to the manufacturer portal.",
    founderKeyMissing: "Enter the founder key first.",
    companyName: "Company name",
    contactName: "Contact name",
    contactEmail: "Contact email",
    seats: "Seats",
    expiresInDays: "Expires in (days)",
    role: "Role",
    roleValue: "Reviewer (pilot)",
    generate: "Generate invite code",
    generating: "Generating…",
    companyRequired: "Company name is required",
    copy: "Copy",
    copied: "Copied!",
    codeLabel: "Invite code",
    success: "Invite created successfully",
    error: "Failed to create invite",
    listTitle: "Existing company codes",
    listEmpty: "No company codes yet.",
    listFailed: "Could not load company codes",
    used: "used",
    expires: "expires",
  },
  it: {
    title: "Console founder",
    subtitle: "Genera codici d'invito per le aziende pilota",
    founderKey: "Chiave founder",
    founderKeyHint: "Salvata solo in questa scheda. Mai inviata al portale del produttore.",
    founderKeyMissing: "Inserisci prima la chiave founder.",
    companyName: "Nome azienda",
    contactName: "Nome contatto",
    contactEmail: "Email contatto",
    seats: "Posti",
    expiresInDays: "Scade tra (giorni)",
    role: "Ruolo",
    roleValue: "Revisore (pilota)",
    generate: "Genera codice invito",
    generating: "Generazione…",
    companyRequired: "Il nome azienda è obbligatorio",
    copy: "Copia",
    copied: "Copiato!",
    codeLabel: "Codice invito",
    success: "Invito creato con successo",
    error: "Errore nella creazione dell'invito",
    listTitle: "Codici azienda esistenti",
    listEmpty: "Nessun codice azienda.",
    listFailed: "Impossibile caricare i codici azienda",
    used: "usati",
    expires: "scade",
  },
} as const;

export default function FounderPage() {
  const [locale, setLocale] = useState("en");
  const [founderKey, setFounderKey] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [seats, setSeats] = useState(5);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [generatedCode, setGeneratedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<FounderInvite[]>([]);

  useEffect(() => {
    const cookies = document.cookie.split("; ").reduce((acc, cookie) => {
      const [key, value] = cookie.split("=");
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    setLocale(cookies.tf_locale || "en");
    const storedKey = sessionStorage.getItem("tf_founder_key") || "";
    setFounderKey(storedKey);
    if (storedKey) void loadInvites(storedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const texts = TEXTS[locale as "en" | "it"];

  async function loadInvites(key: string) {
    if (!key) {
      setInvites([]);
      return;
    }
    try {
      const data = await apiFounderList(key);
      setInvites(data.items);
    } catch {
      setInvites([]);
      setError(texts.listFailed);
    }
  }

  async function generate() {
    const key = founderKey.trim();
    if (!key) {
      setError(texts.founderKeyMissing);
      return;
    }
    if (!companyName.trim()) {
      setError(texts.companyRequired);
      return;
    }
    setError(""); setBusy(true); setGeneratedCode(""); setCopied(false);
    try {
      sessionStorage.setItem("tf_founder_key", key);
      const data = await apiFounderMint(key, {
        company_name: companyName.trim(),
        contact_name: contactName.trim(),
        contact_email: contactEmail.trim(),
        seats,
        days: expiresInDays,
      });
      setGeneratedCode(data.code);
      await loadInvites(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : texts.error);
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (generatedCode) {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const inputCls =
    "mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3.5 text-[15px] outline-none transition-shadow duration-150 placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-ink/15";

  return (
    <main className="flex min-h-screen bg-muted/30">
      <div className="w-full max-w-3xl mx-auto px-6 py-12">
        <header className="flex items-center justify-between gap-3 mb-10">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-paper">
            <Fingerprint size={20} />
          </span>
          <LanguageSwitcher />
        </header>

        <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">{texts.title}</h1>
        <p className="text-inksoft mb-8">{texts.subtitle}</p>

        <div className="rounded-xl2 border border-line bg-white/70 p-8 shadow-card space-y-6">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="founder-key">
              {texts.founderKey}
            </label>
            <div className="relative">
              <KeyRound size={16} className="pointer-events-none absolute left-3.5 top-[26px] text-muted" />
              <input
                id="founder-key"
                type="password"
                autoComplete="off"
                value={founderKey}
                onChange={(e) => setFounderKey(e.target.value)}
                onBlur={() => {
                  sessionStorage.setItem("tf_founder_key", founderKey.trim());
                  void loadInvites(founderKey.trim());
                }}
                placeholder="X-Founder-Key"
                className={`${inputCls} pl-10`}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted">{texts.founderKeyHint}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.companyName}</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Footwear Srl" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.contactName}</label>
              <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Mario Rossi" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.contactEmail}</label>
              <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="mario@acme.com" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.role}</label>
              <input readOnly value={texts.roleValue} className={`${inputCls} cursor-not-allowed text-muted`} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.seats}</label>
              <input type="number" min="1" max="100" value={seats} onChange={e => setSeats(Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.expiresInDays}</label>
              <input type="number" min="1" max="365" value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))} className={inputCls} />
            </div>
          </div>

          <button onClick={generate} disabled={busy} className="min-h-[44px] w-full rounded-xl bg-ink font-semibold text-paper transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50">
            {busy ? texts.generating : texts.generate}
          </button>

          {error && <p className="text-sm font-medium text-brick flex items-center gap-2"><AlertCircle size={16} />{error}</p>}

          {generatedCode && (
            <div className="border-t border-line pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.codeLabel}</span>
              </div>
              <div className="flex gap-3">
                <input readOnly value={generatedCode} className="flex-1 min-h-[44px] rounded-lg border border-line bg-parchment px-3.5 text-[15px] font-mono" />
                <button onClick={copyCode} className="min-h-[44px] px-4 rounded-xl bg-parchment font-semibold text-ink transition-colors hover:bg-line/50 flex items-center gap-2">
                  {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  {copied ? texts.copied : texts.copy}
                </button>
              </div>
              <p className="text-xs text-muted">
                Share this code with the company. They use it on the <a href="/login" className="underline hover:text-ink">sign-up page</a>.
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-xl2 border border-line bg-white/70 p-6 shadow-card">
          <h2 className="font-display text-lg font-semibold">{texts.listTitle}</h2>
          {invites.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{texts.listEmpty}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {invites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm">
                  <span className="font-semibold">{inv.company_name || "(no company)"}</span>
                  <span className="font-mono text-xs text-muted">{inv.role}</span>
                  <span className="ml-auto font-mono text-xs text-inksoft">
                    {inv.used_count}/{inv.max_uses ?? "∞"} {texts.used}
                    {inv.expires_at ? ` · ${texts.expires} ${new Date(inv.expires_at).toLocaleDateString(locale)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
