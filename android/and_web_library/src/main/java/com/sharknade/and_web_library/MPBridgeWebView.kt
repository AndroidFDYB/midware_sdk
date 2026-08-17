package com.sharknade.and_web_library

import android.content.Context
import android.util.AttributeSet
import android.util.Log
import com.github.lzyzsd.jsbridge.BridgeWebView
import com.github.lzyzsd.jsbridge.BridgeHandler
import com.github.lzyzsd.jsbridge.OnBridgeCallback

/**
 * MPBridgeWebView
 *
 * 基于 happydog-intj/JsBridge 的 BridgeWebView 封装。
 * 提供统一的 JSBridge 通信能力，支持：
 * - JS 调用 Native（同步 / 异步）
 * - Native 调用 JS
 * - Handler 注册与管理
 *
 * 使用方式：
 * ```kotlin
 * val webView = MPBridgeWebView(context)
 *
 * // 注册 Native Handler 供 JS 调用
 * webView.registerBridgeHandler("getUserInfo") { data, callback ->
 *     val result = """{"name":"test","age":25}"""
 *     callback.onCallBack(result)
 * }
 *
 * // 调用 JS Handler
 * webView.callBridgeHandler("onPageReady", """{"page":"home"}""") { result ->
 *     Log.d("MPBridge", "JS returned: $result")
 * }
 *
 * webView.loadBridgeUrl("https://your-page.com")
 * ```
 */
class MPBridgeWebView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : BridgeWebView(context, attrs) {

    init {
        if (MPBridgeConfig.debug) {
            Log.d(MPBridgeConfig.LOG_TAG, "MPBridgeWebView initialized in debug mode")
        }
    }

    /**
     * 注册 Native Handler 供 JS 调用
     *
     * @param methodName 方法名（JS 端通过 bridge.callHandler(methodName, ...) 调用）
     * @param handler 处理函数：(data: String, callback: CallBackFunction) -> Unit
     *   - data: JS 传来的 JSON 字符串参数
     *   - callback: 调用 callback.onCallBack(result) 返回结果给 JS
     *
     * 示例：
     * ```kotlin
     * webView.registerBridgeHandler("pay") { data, callback ->
     *     val params = JSONObject(data)
     *     // 执行支付逻辑...
     *     callback.onCallBack("""{"status":"success"}""")
     * }
     * // JS 调用: bridge.callHandler("pay", {amount: 100}, function(res) { ... })
     * ```
     */
    fun registerBridgeHandler(methodName: String, handler: (String, OnBridgeCallback) -> Unit) {
        if (MPBridgeConfig.debug) {
            Log.d(MPBridgeConfig.LOG_TAG, "registerBridgeHandler: method=$methodName")
        }
        registerHandler(methodName ,BridgeHandler { data, function ->
            if (MPBridgeConfig.debug) {
                Log.d(MPBridgeConfig.LOG_TAG, "Handler called: method=$methodName, data=$data")
            }
            handler(data, function)

        })
    }

    /**
     * 调用 JS Handler（带回调）
     *
     * @param methodName JS 端注册的方法名
     * @param data 传递给 JS 的参数（JSON 字符串）
     * @param callback JS 返回结果的回调
     *
     * 示例：
     * ```kotlin
     * webView.callBridgeHandler("onDataUpdate", """{"key":"value"}""") { result ->
     *     Log.d("MPBridge", "JS returned: $result")
     * }
     * ```
     */
    fun callBridgeHandler(methodName: String, data: String?, callback: OnBridgeCallback?) {
        if (MPBridgeConfig.debug) {
            Log.d(MPBridgeConfig.LOG_TAG, "callBridgeHandler: method=$methodName, data=$data")
        }
        callHandler(methodName, data ?: "", callback)
    }

    /**
     * 调用 JS Handler（简化版，无参数）
     */
    fun callBridgeHandler(methodName: String, callback: OnBridgeCallback?) {
        callBridgeHandler(methodName, null, callback)
    }

    /**
     * 调用 JS Handler（无回调）
     */
    fun callBridgeHandler(methodName: String, data: String?) {
        callBridgeHandler(methodName, data, null)
    }

    /**
     * 加载 URL 并注入桥接
     * BridgeWebView 会自动注入 WebViewJavascriptBridge，无需额外操作
     * 自动在 URL 追加 ?platform=android 查询参数，供前端检测平台
     *
     * @param url 目标页面 URL
     */
    fun loadBridgeUrl(url: String) {
        val finalUrl = appendPlatformParam(url)
        if (MPBridgeConfig.debug) {
            Log.d(MPBridgeConfig.LOG_TAG, "loadBridgeUrl: $url → $finalUrl")
        }
        loadUrl(finalUrl)
    }

    /**
     * 在 URL 上追加 platform 查询参数
     * 如果 URL 已包含 platform 参数则不重复追加
     */
    private fun appendPlatformParam(url: String): String {
        if (url.contains("platform=")) return url
        val separator = if (url.contains("?")) "&" else "?"
        return "$url${separator}platform=android"
    }

}
