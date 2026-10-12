import type { MetadataRoute } from 'next';

// /admin is deliberately not listed: guests get a 404 there, and naming it here would reveal it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api' },
  };
}
