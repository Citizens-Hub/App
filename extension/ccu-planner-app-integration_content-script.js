(() => {
  const ORIGIN = window.origin;
  !function () {
      let connect;
      let t;
      let promise = new Promise(element => {
          t = element;
      });
      let _null = null;
      function s() {
          connect = chrome.runtime.connect();
          console.log('ccuPlanner extension connected');
          t();
          connect.onDisconnect.addListener(function () {
              console.log('ccuPlanner extension disconnected (chrome "bug"), reconnecting');
              promise = new Promise(element => {
                  t = element;
              });
              s();
          });
          connect.onMessage.addListener(function (message) {
              _null = null;
              window.postMessage({
                  type: 'ccuPlannerAppIntegrationResponse',
                  message: message
              }, ORIGIN);
          });
          if (null != _null) {
              connect.postMessage(_null);
          }
      }
      function a() {
          s();
          window.addEventListener('message', async function (e) {
              if (e.source === window && e.data && 'ccuPlannerAppIntegrationRequest' === e.data.type) {
                  await promise;
                  _null = e.data.message;
                  connect.postMessage(e.data.message);
              }
          }, false);
          const CREATEELEMENT = document.createElement('meta');
          CREATEELEMENT.setAttribute('name', '__ccuPlanner_app_integration');
          (document.head || document.documentElement).appendChild(CREATEELEMENT);
      }
      window.addEventListener('DOMContentLoaded', element => {
          a();
      });
  }();
})();