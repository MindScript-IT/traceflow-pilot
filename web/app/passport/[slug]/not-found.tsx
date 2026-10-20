import { cookies } from "next/headers";
import { FileQuestion } from "lucide-react";
import en from "../../../messages/en.json";
import it from "../../../messages/it.json";

const MESSAGES = { en, it } as const;

export default function PassportNotFound() {
  const locale = cookies().get("tf_locale")?.value === "it" ? "it" : "en";
  const t = MESSAGES[locale].passport;
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <FileQuestion className="mx-auto text-muted" size={28} />
        <h1 className="mt-3 font-display text-3xl font-semibold">{t.notFoundTitle}</h1>
        <p className="mt-2 text-inksoft">{t.notFoundBody}</p>
        <a href="/" className="mt-6 inline-block font-semibold underline">{t.backToHome}</a>
      </div>
    </main>
  );
}
