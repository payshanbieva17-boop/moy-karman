import './globals.css';
import DataProvider from '@/components/DataProvider';
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'Мой карман — личные финансы',
  description: 'Учёт доходов и расходов в сомони',
  manifest: '/manifest.webmanifest',
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
