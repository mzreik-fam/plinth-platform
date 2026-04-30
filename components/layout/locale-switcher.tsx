"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { Globe } from "lucide-react";

const locales = [
  { code: "en", label: "EN" },
  { code: "ar", label: "AR" },
];

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(newLocale: string) {
    const newPath = pathname.replace(/^\/(en|ar)/, `/${newLocale}`);
    router.push(newPath);
  }

  return (
    <div className="relative">
      <Globe className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <select
        value={locale}
        onChange={(e) => switchLocale(e.target.value)}
        className="h-8 pl-7 pr-2 text-xs rounded-md border bg-background text-foreground appearance-none cursor-pointer hover:bg-muted/50 transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {locales.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
