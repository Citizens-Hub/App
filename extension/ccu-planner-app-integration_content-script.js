(() => {
  const ORIGIN = window.origin;

  (function initialize() {
    let port;
    let resolveConnectionPromise;
    let connectionPromise = new Promise(resolve => {
      resolveConnectionPromise = resolve;
    });
    let pendingMessage = null;

    function connectToExtension() {
      port = chrome.runtime.connect();
      console.log('ccu planner extension connected');
      resolveConnectionPromise();

      port.onDisconnect.addListener(() => {
        connectionPromise = new Promise(resolve => {
          resolveConnectionPromise = resolve;
        });
        connectToExtension();
      });

      port.onMessage.addListener(message => {
        pendingMessage = null;
        window.postMessage({
          type: 'ccuPlannerAppIntegrationResponse',
          message: message
        }, ORIGIN);
      });

      if (pendingMessage !== null) {
        port.postMessage(pendingMessage);
      }
    }

    function setupMessageHandling() {
      connectToExtension();

      window.addEventListener('message', async (event) => {
        if (event.source === window && event.data && event.data.type === 'ccuPlannerAppIntegrationRequest') {
          await connectionPromise;
          pendingMessage = event.data.message;
          port.postMessage(event.data.message);
        }
      }, false);

      const integrationMarker = document.createElement('meta');
      integrationMarker.setAttribute('name', '__ccu_planner_app_integration');
      (document.head || document.documentElement).appendChild(integrationMarker);
    }

    window.addEventListener('DOMContentLoaded', () => {
      setupMessageHandling();
    });
  })();
})();