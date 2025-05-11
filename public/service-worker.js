// 缓存版本标识
const CACHE_NAME = 'citizens-hub-v1';

// 需要缓存的资源列表
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/src/App.css',
  '/src/main.tsx',
  // 可以根据需要添加更多资源
];

// 安装服务工作线程时缓存资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('已打开缓存');
        return cache.addAll(urlsToCache);
      })
  );
});

// 网络请求拦截，优先使用缓存
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果在缓存中找到了匹配的资源，则返回缓存的版本
        if (response) {
          return response;
        }
        // 否则从网络获取
        return fetch(event.request).then(
          response => {
            // 检查响应是否有效
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // 克隆响应以便同时用于缓存和浏览器
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

// 激活时清理旧缓存
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
}); 