/**
 * MPBridge JS 端桥接代码
 *
 * 此文件注入到 HarmonyOS WebView 中，提供与 DSBridge 兼容的 JS API。
 * 注入后 JS 端可使用 window.dsBridge 进行桥接通信。
 *
 * 协议兼容 DSBridge，前端可使用 dsbridge npm 包。
 *
 * 注入方式：通过 Web 组件的 javaScriptAccess 注入到 window._dsbridge
 * 同时定义 window.dsBridge 作为用户调用的入口
 */

(function () {
  if (window.__dsBridgeInitialized) return;
  window.__dsBridgeInitialized = true;

  // 标记鸿蒙环境
  window.__harmony_bridge = true;

  var callbackId = 0;
  var callbacks = {};
  var handlers = {};
  var asyncHandlers = {};

  /**
   * 生成唯一回调 ID
   */
  function genCallbackId() {
    return 'cb_' + (callbackId++) + '_' + Date.now();
  }

  /**
   * 内部桥接对象（由 ArkTS javaScriptProxy 注入 _dsbridge）
   * 如果 ArkTS 已注入 _dsbridge，则使用原生实现；
   * 否则创建一个 fallback（用于纯 Web 调试）
   */
  if (!window._dsbridge) {
    window._dsbridge = {
      call: function (requestJson) {
        console.warn('[MPBridge] _dsbridge.call: no native bridge, request=' + requestJson);
        return JSON.stringify({ callbackId: '', code: -99, data: '', message: 'No native bridge' });
      },
      callAsync: function (requestJson) {
        console.warn('[MPBridge] _dsbridge.callAsync: no native bridge, request=' + requestJson);
        return '';
      },
      hasMethod: function (method) {
        return false;
      },
      onNativeCallComplete: function (callbackId, result) {}
    };
  }

  /**
   * dsBridge 用户 API
   */
  window.dsBridge = {

    /**
     * 调用 Native 方法（同步）
     * @param {string} method 方法名
     * @param {*} params 参数
     * @returns {*} 返回值
     */
    call: function (method, params) {
      var cbId = genCallbackId();
      var request = {
        callbackId: cbId,
        method: method,
        params: JSON.stringify(params !== undefined ? params : {})
      };
      var responseJson = window._dsbridge.call(JSON.stringify(request));
      try {
        var response = JSON.parse(responseJson);
        if (response.code === 0) {
          try { return JSON.parse(response.data); }
          catch (e) { return response.data; }
        } else {
          console.error('[MPBridge] call failed:', response.message);
          return null;
        }
      } catch (e) {
        return responseJson;
      }
    },

    /**
     * 调用 Native 方法（异步）
     * @param {string} method 方法名
     * @param {*} params 参数
     * @param {function} callback 回调函数
     */
    callAsync: function (method, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = {};
      }
      var cbId = genCallbackId();
      if (callback) {
        callbacks[cbId] = callback;
      }
      var request = {
        callbackId: cbId,
        method: method,
        params: JSON.stringify(params !== undefined ? params : {})
      };
      window._dsbridge.callAsync(JSON.stringify(request));
    },

    /**
     * 注册同步 Handler
     * @param {string} method 方法名
     * @param {function} handler 处理器
     */
    register: function (method, handler) {
      if (typeof handler === 'object') {
        // 命名空间注册
        var namespace = method;
        var apiObj = handler;
        for (var key in apiObj) {
          if (apiObj.hasOwnProperty(key) && typeof apiObj[key] === 'function') {
            handlers[namespace + '.' + key] = apiObj[key];
          }
        }
      } else {
        handlers[method] = handler;
      }
    },

    /**
     * 注册异步 Handler
     * @param {string} method 方法名
     * @param {function} handler 处理器
     */
    registerAsyn: function (method, handler) {
      if (typeof handler === 'object') {
        var namespace = method;
        var apiObj = handler;
        for (var key in apiObj) {
          if (apiObj.hasOwnProperty(key) && typeof apiObj[key] === 'function') {
            asyncHandlers[namespace + '.' + key] = apiObj[key];
          }
        }
      } else {
        asyncHandlers[method] = handler;
      }
    },

    /**
     * 检查方法是否已注册
     * @param {string} method 方法名
     */
    hasMethod: function (method) {
      return !!(handlers[method] || asyncHandlers[method] || window._dsbridge.hasMethod(method));
    },

    /**
     * 内部方法：处理 Native 异步调用的响应（由 ArkTS 调用）
     */
    _handleResponse: function (response) {
      var cb = callbacks[response.callbackId];
      if (cb) {
        var data = response.data;
        try { data = JSON.parse(data); } catch (e) {}
        cb(data);
        delete callbacks[response.callbackId];
      }
    },

    /**
     * 内部方法：处理 Native -> JS 的调用（由 ArkTS 调用）
     */
    _handleNativeCall: function (request) {
      var method = request.method;
      var args = [];
      try { args = JSON.parse(request.params); } catch (e) {}
      var callbackId = request.callbackId;

      // 先查 JS 注册的 handler
      if (handlers[method]) {
        var result = handlers[method].apply(null, args);
        window._dsbridge.onNativeCallComplete(callbackId, JSON.stringify(result));
        return;
      }
      if (asyncHandlers[method]) {
        asyncHandlers[method].apply(null, args.concat([function (result) {
          window._dsbridge.onNativeCallComplete(callbackId, JSON.stringify(result));
        }]));
        return;
      }

      // 方法不存在
      console.warn('[MPBridge] JS handler not found:', method);
      window._dsbridge.onNativeCallComplete(callbackId, JSON.stringify(null));
    }
  };

  // 兼容 dsbridge npm 包的 API 名称
  window.dsBridge.call = window.dsBridge.call;
})();
