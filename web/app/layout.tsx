import "./globals.css";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import { cookies } from "next/headers";
import { LocaleProvider } from "@/components/LocaleProvider";
import en from "../messages/en.json";
import it from "../messages/it.json";

const MESSAGES = { en, it } as const;
const LOCALE_COOKIE = "tf_locale";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata = { title: "TraceFlow AI — Digital Product Passports", description: "Verified supplier evidence, human-reviewed, published as a Digital Product Passport." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value;
  const locale = cookieLocale && cookieLocale in MESSAGES ? (cookieLocale as keyof typeof MESSAGES) : "en";
  return (
    <html lang={locale} className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        <LocaleProvider locale={locale} messages={MESSAGES[locale]}>{children}</LocaleProvider>
      </body>
    </html>
  );
}