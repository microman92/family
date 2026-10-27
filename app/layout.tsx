import type { Metadata } from 'next';
import { Providers } from '@/_app';
import { getPublicEnvironment } from '@/_app/index.server';
import '@/_app/styles/tailwind.css';
import '@fontsource-variable/onest';
import '@/_app/styles/globals.scss';

const environment = getPublicEnvironment();

export const metadata: Metadata = {
  metadataBase: new URL(environment.appUrl),
  title: { default: 'Family Space: семейные дела', template: '%s | Family Space' },
  description: 'Общее пространство для семейных дел, покупок, планов и финансов.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
