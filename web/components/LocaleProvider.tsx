"use client";
import { NextIntlClientProvider } from "next-intl";

/** Always renders the provider: locale + messages are resolved on the server
 * (root layout reads the `tf_locale` cookie), so every client component can
 * call useTranslations() on the very first render with no flash of English. */
export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: Record<string, unknown>;
  children: React.ReactNode;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}