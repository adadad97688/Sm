self.addEventListener('install', (event) => {
    console.log('Service worker installed.');
});
self.addEventListener('fetch', (event) => {
    // Leave blank for now, required for PWA validation
});
