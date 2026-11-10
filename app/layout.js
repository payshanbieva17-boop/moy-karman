import './globals.css';
import DataProvider from '@/components/DataProvider';
import AppShell from '@/components/AppShell';
import { BASE_PATH } from '@/lib/base';

export const metadata = {
  title: 'Мой карман — личные финансы',
  description: 'Учёт доходов и расходов в рублях',
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: 'Мой карман', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1F6F5C',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        <DataProvider>
          <AppShell>{children}</AppShell>
        </DataProvider>
      </body>
    </html>
  );
}
