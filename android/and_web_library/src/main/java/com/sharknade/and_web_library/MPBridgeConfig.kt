package com.sharknade.and_web_library

/**
 * MPBridge 全局配置
 */
object MPBridgeConfig {
    /**
     * 是否开启调试模式
     * 调试模式下会在 Logcat 输出详细的桥接调用日志
     */
    var debug: Boolean = false

    /**
     * 异步调用超时时间（毫秒）
     * 默认 30 秒
     */
    var callTimeout: Long = 30_000L

    /**
     * 日志 TAG
     */
    const val LOG_TAG: String = "MPBridge"
}
