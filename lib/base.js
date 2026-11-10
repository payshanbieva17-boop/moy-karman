export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const appUrl = (path = '/') => (typeof window !== 'undefined' ? window.location.origin : '') + BASE_PATH + path;
