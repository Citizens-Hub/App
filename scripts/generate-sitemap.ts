import { writeFileSync } from 'fs';
import { join } from 'path';

type SitemapRoute = {
  path: string;
  priority: number;
  changefreq: string;
};

type MarketSitemapItem = {
  skuId: string;
};

type MarketSitemapResponse = {
  items?: MarketSitemapItem[];
  pagination?: {
    totalPages?: number;
  };
};

type PromotionSitemapItem = {
  slug: string;
  status?: string;
};

type PromotionSitemapResponse = {
  promotions?: PromotionSitemapItem[];
};

// Define public routes that should be included in sitemap
// Exclude routes that require authentication, have dynamic params, or are not public
const publicRoutes: SitemapRoute[] = [
  {
    path: '/',
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/ccu-planner',
    priority: 1,
    changefreq: 'weekly',
  },
  {
    path: '/hangar',
    priority: 1,
    changefreq: 'weekly',
  },
  {
    path: '/price-history',
    priority: 1,
    changefreq: 'weekly',
  },
  {
    path: '/market',
    priority: 1,
    changefreq: 'daily',
  },
  {
    path: '/store-preview',
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/privacy',
    priority: 0.5,
    changefreq: 'monthly',
  },
  {
    path: '/changelog',
    priority: 0.5,
    changefreq: 'monthly',
  },
  {
    path: '/blog',
    priority: 1,
    changefreq: 'weekly',
  },
  {
    path: '/login',
    priority: 0.5,
    changefreq: 'monthly',
  },
  {
    path: '/register',
    priority: 0.5,
    changefreq: 'monthly',
  },
];

// Base URL for the site
const isCnMirror = process.env.VITE_PUBLIC_CN_MIRROR === 'true';
const baseUrl = (process.env.VITE_PUBLIC_BASE_URL || 'https://citizenshub.app').replace(/\/+$/, '');

const getRouteUrl = (path: string): string => {
  return isCnMirror
    ? `${baseUrl}/#${path}`
    : `${baseUrl}${path}`;
};

// Get current date in YYYY-MM-DD format
const getCurrentDate = (): string => {
  return new Date().toISOString().split('T')[0];
};

// Generate sitemap XML
const generateSitemap = (): string => {
  const urls = publicRoutes
    .map((route) => {
      return `  <url>
    <loc>${getRouteUrl(route.path)}</loc>
    <lastmod>${getCurrentDate()}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
};

const getShips = async () => {
  const response = await fetch(`${process.env.VITE_PUBLIC_API_ENDPOINT || 'https://worker.citizenshub.app'}/api/ships`);
  const data = await response.json();
  return data.data.ships;
};

const getBlogPosts = async () => {
  const response = await fetch(`${process.env.VITE_PUBLIC_API_ENDPOINT || 'https://worker.citizenshub.app'}/api/blog/posts?limit=99999`);
  const data = await response.json();
  return data.posts;
};

const getMarketItems = async () => {
  const apiBaseUrl = process.env.VITE_PUBLIC_API_ENDPOINT || 'https://worker.citizenshub.app';
  const firstPageResponse = await fetch(`${apiBaseUrl}/api/market/search?limit=100&page=0`);
  const firstPageData = await firstPageResponse.json() as MarketSitemapResponse;
  const totalPages = firstPageData.pagination?.totalPages || 0;
  const items = [...(firstPageData.items || [])];

  if (totalPages <= 1) {
    return items;
  }

  const remainingPages = Array.from({ length: totalPages - 1 }, (_, index) => index + 1);
  const remainingResponses = await Promise.all(
    remainingPages.map(async (page) => {
      const response = await fetch(`${apiBaseUrl}/api/market/search?limit=100&page=${page}`);
      return response.json() as Promise<MarketSitemapResponse>;
    }),
  );

  remainingResponses.forEach((payload) => {
    items.push(...(payload.items || []));
  });

  return items;
};

const getPromotions = async () => {
  const apiBaseUrl = process.env.VITE_PUBLIC_API_ENDPOINT || 'https://worker.citizenshub.app';
  try {
    const response = await fetch(`${apiBaseUrl}/api/promotions`);
    if (!response.ok) {
      return [];
    }

    const data = await response.json() as PromotionSitemapResponse;
    return data.promotions || [];
  } catch {
    return [];
  }
};

const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

// Main function
const main = async () => {
  const ships = await getShips();

  ships.forEach(ship => {
    publicRoutes.push({
      path: `/price-history/${generateSlug(ship.name)}`,
      priority: 0.5,
      changefreq: 'weekly',
    });
  });

  const blogPosts = await getBlogPosts();
  blogPosts.forEach(blogPost => {
    publicRoutes.push({
      path: `/blog/${blogPost.slug}`,
      priority: 0.8,
      changefreq: 'weekly',
    });
  });

  const marketItems = await getMarketItems();
  marketItems.forEach((item) => {
    if (!item?.skuId) {
      return;
    }

    publicRoutes.push({
      path: `/market/${encodeURIComponent(item.skuId)}`,
      priority: 0.7,
      changefreq: 'daily',
    });
  });

  const promotions = await getPromotions();
  promotions.forEach((promotion) => {
    if (!promotion?.slug || promotion.status !== 'active') {
      return;
    }

    publicRoutes.push({
      path: `/market/promotions/${encodeURIComponent(promotion.slug)}`,
      priority: 0.9,
      changefreq: 'daily',
    });
  });

  const sitemap = generateSitemap();
  const outputPath = join(process.cwd(), 'public', 'sitemap.xml');
  
  writeFileSync(outputPath, sitemap, 'utf-8');

  console.log(`✅ Sitemap generated successfully at ${outputPath}`);
  console.log(`   Generated ${publicRoutes.length} URLs`);
  console.log(`   Route mode: ${isCnMirror ? 'hash' : 'browser'}`);
};

main();
