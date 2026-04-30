import type {Metadata} from 'next';
import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {routing} from '@/lib/i18n';
import {ThemeProvider} from '@/components/layout/theme-provider';
import {GeistSans} from 'geist/font/sans';
import {GeistMono} from 'geist/font/mono';
import {Toaster} from '@/components/ui/sonner';
import '../globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Plinth - Real Estate Platform',
    template: '%s | Plinth',
  },
  description: 'Real estate sales, handover, and termination management platform.',
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider messages={messages}>
            {children}
            <Toaster position="top-right" richColors />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
