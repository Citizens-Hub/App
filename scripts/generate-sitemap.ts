import { writeFileSync } from 'fs';
import { join } from 'path';

// Define public routes that should be included in sitemap
// Exclude routes that require authentication, have dynamic params, or are not public
const publicRoutes = [
  {
    path: '/',
    priority: 1,
    changefreq: 'weekly',
  },
  {
    path: '/ccu-planner',
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/hangar',
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/price-history',
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/store-preview',
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/privacy',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/changelog',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/blog',
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/login',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/register',
    priority: 0.8,
    changefreq: 'monthly',
  },
];

// Base URL for the site
const baseUrl = process.env.VITE_PUBLIC_BASE_URL || 'https://citizenshub.app';

// Get current date in YYYY-MM-DD format
const getCurrentDate = (): string => {
  return new Date().toISOString().split('T')[0];
};

// Generate sitemap XML
const generateSitemap = (): string => {
  const urls = publicRoutes
    .map((route) => {
      return `  <url>
    <loc>${baseUrl}${route.path}</loc>
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
      priority: 0.5,
      changefreq: 'weekly',
    });
  });

  const sitemap = generateSitemap();
  const outputPath = join(process.cwd(), 'public', 'sitemap.xml');
  
  writeFileSync(outputPath, sitemap, 'utf-8');

  console.log(`✅ Sitemap generated successfully at ${outputPath}`);
  console.log(`   Generated ${publicRoutes.length} URLs`);
};

main();

