/** @type {import('next').NextConfig} */
// Приложение целиком работает в браузере и обращается к Supabase напрямую,
// поэтому собирается в статический сайт (папка out/) — его можно разместить
// на GitHub Pages, Vercel, Netlify или любом хостинге.
// NEXT_PUBLIC_BASE_PATH нужен, когда сайт живёт в подпапке (GitHub Pages: /moy-karman).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
};
export default nextConfig;
