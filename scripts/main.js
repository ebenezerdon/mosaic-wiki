// Auto-created main entry to complete core structure
$(function(){
  try {
    var hasApp = !!window.App;
    var hasInit = hasApp && typeof window.App.init === 'function';
    var hasRender = hasApp && typeof window.App.render === 'function';
    if (!hasApp || !hasInit || !hasRender) {
      var details = {
        hasApp: hasApp,
        hasInit: hasInit,
        hasRender: hasRender,
        availableKeys: hasApp ? Object.keys(window.App || {}) : [],
        hint: 'Define in scripts/ui.js: window.App = window.App || {}; App.init = function(){}; App.render = function(){};'
      };
      console.error('[Contract] Missing App.init/App.render', details);
      return;
    }
    App.init();
    App.render();
  } catch (e) {
    console.error('Initialization failed', e);
  }
});
