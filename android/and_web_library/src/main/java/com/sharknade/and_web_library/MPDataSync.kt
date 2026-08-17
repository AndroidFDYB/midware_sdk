package com.sharknade.and_web_library

import android.util.Log
import com.github.lzyzsd.jsbridge.BridgeWebView

// ========================
// 通用注解（非 proto 驱动，用于临时自定义通道）
// ========================

// 注：@NeedsUserInfo / @NeedsLoanInfo / @NeedsVipInfo 等标准通道注解
// 由 ProtoCodegenTask 从 specs/proto/channels.proto 自动生成。
// 参见 build/generated/proto/kotlin/MPDataSyncAnnotations.kt

/**
 * 通用数据同步注解，用于标记自定义数据通道
 *
 * 此注解用于 proto 未定义的临时通道。
 * proto 定义的标准通道请使用生成的 @Needs* 注解。
 *
 * @param channel 数据通道名称，如 "orderInfo"
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
annotation class NeedsDataSync(val channel: String)

// ========================
// WebView 同步状态
// ========================

/** WebView 数据同步状态 */
enum class SyncState {
    /** 初始状态 */
    IDLE,
    /** 页面加载中 */
    LOADING,
    /** 页面已加载，等待或正在推送数据 */
    LOADED,
    /** 所有数据已推送完成 */
    SYNCED
}

// ========================
// 单通道状态
// ========================

/** 单个数据通道的状态 */
private data class ChannelState(
    /** 业务数据 JSON 字符串，null 表示尚未设置 */
    var data: String? = null,
    /** 是否已推送到 JS */
    var pushed: Boolean = false
)

// ========================
// MPDataSyncHelper
// ========================

/**
 * Native 端数据同步辅助器
 *
 * 通过 KSP 在编译期扫描 @NeedsUserInfo / @NeedsLoanInfo 等注解生成 DataSyncBindings 注册表，
 * 运行时通过构造函数传入所需数据通道，无反射开销。
 *
 * 管理页面加载状态和各通道数据推送状态，
 * 在「页面加载完成」+「数据就绪」时自动通过 JSBridge 推送数据到前端。
 *
 * 数据推送时机：
 * 1. 页面已加载 + 数据已就绪 → 立即推送
 * 2. 页面已加载 + 数据未就绪 → 等待数据到达后推送
 * 3. 页面未加载 + 数据已就绪 → 等待页面加载完成后推送
 *
 * 使用方式（组合模式 + KSP 注入）：
 * ```kotlin
 * @NeedsUserInfo
 * @NeedsLoanInfo
 * class LoanActivity : AppCompatActivity() {
 *     private lateinit var webView: MPBridgeWebView
 *     private lateinit var dataSyncHelper: MPDataSyncHelper
 *
 *     override fun onCreate(savedInstanceState: Bundle?) {
 *         super.onCreate(savedInstanceState)
 *         webView = MPBridgeWebView(this)
 *         // KSP 生成的注册表，编译期确定通道
 *         val channels = DataSyncBindings.getChannels(this.javaClass.name)
 *         dataSyncHelper = MPDataSyncHelper.create(webView, channels)
 *
 *         // 设置业务数据
 *         dataSyncHelper.setUserInfo("""{"uid":"123","ticket":"abc"}""")
 *         dataSyncHelper.setLoanInfo("""{"loanId":"L001","amount":50000}""")
 *
 *         // 加载页面
 *         webView.loadBridgeUrl("https://example.com/loan")
 *     }
 *
 *     // WebViewClient 回调中通知页面状态
 *     // onPageStarted → dataSyncHelper.notifyPageLoading()
 *     // onPageFinished → dataSyncHelper.notifyPageLoaded()
 * }
 * ```
 */
class MPDataSyncHelper private constructor(
    private val webView: BridgeWebView,
    private val requiredChannels: Set<String>
) {
    /** 各通道状态 */
    private val channelStates: MutableMap<String, ChannelState> = mutableMapOf()

    /** 当前同步状态 */
    private var syncState: SyncState = SyncState.IDLE

    init {
        // 初始化所需通道的状态
        for (channel in requiredChannels) {
            channelStates[channel] = ChannelState()
        }
        if (MPBridgeConfig.debug) {
            Log.d(MPBridgeConfig.LOG_TAG, "MPDataSyncHelper: requiredChannels=$requiredChannels")
        }
    }

    companion object {
        /**
         * 为指定的 BridgeWebView 创建 DataSyncHelper
         * @param webView JSBridge 封装的 WebView 实例
         * @param requiredChannels 所需数据通道集合（由 KSP 生成的 DataSyncBindings 提供）
         */
        fun create(webView: BridgeWebView, requiredChannels: Set<String>): MPDataSyncHelper {
            return MPDataSyncHelper(webView, requiredChannels)
        }
    }

    /** 获取所需数据通道列表 */
    fun getRequiredChannels(): Set<String> = requiredChannels.toSet()

    /** 获取当前同步状态 */
    fun getSyncState(): SyncState = syncState

    /**
     * 通知页面已加载完成
     * 应在 WebViewClient.onPageFinished() 中调用
     * 或通过 MPBridgeWebView.notifyPageLoaded() 调用
     */
    fun notifyPageLoaded() {
        if (syncState == SyncState.LOADING || syncState == SyncState.IDLE) {
            syncState = SyncState.LOADED
            if (MPBridgeConfig.debug) {
                Log.d(MPBridgeConfig.LOG_TAG, "MPDataSyncHelper: page loaded, checking pending data")
            }
            pushPendingData()
        }
    }

    /** 通知页面开始加载 */
    fun notifyPageLoading() {
        syncState = SyncState.LOADING
        // 重置推送状态（新页面需要重新推送）
        for (state in channelStates.values) {
            state.pushed = false
        }
    }

    // ========================
    // 设置业务数据
    // ========================

    // 注：setUserInfo / setLoanInfo / setVipInfo 等便捷 setter
    // 由 ProtoCodegenTask 从 specs/proto/channels.proto 自动生成为扩展函数。
    // 参见 build/generated/proto/kotlin/MPDataSyncHelperSetters.kt

    /**
     * 设置指定通道的业务数据
     * 如果页面已加载，会立即尝试推送
     *
     * @param channel 通道名称
     * @param data JSON 字符串
     */
    fun setData(channel: String, data: String) {
        val state = channelStates.getOrPut(channel) { ChannelState() }
        state.data = data
        state.pushed = false

        if (MPBridgeConfig.debug) {
            Log.d(MPBridgeConfig.LOG_TAG, "MPDataSyncHelper: data set for channel=$channel, pending push")
        }

        // 页面已加载则立即推送
        if (syncState == SyncState.LOADED) {
            pushPendingData()
        }
    }

    // ========================
    // 数据推送
    // ========================

    /**
     * 推送所有待推送的数据
     * 仅推送 requiredChannels 中标记为需要且数据已就绪但尚未推送的通道
     */
    private fun pushPendingData() {
        var allPushed = true

        for (channel in requiredChannels) {
            val state = channelStates[channel]
            if (state != null && state.data != null && !state.pushed) {
                val methodName = DataSyncMethod.fromChannel(channel)
                webView.callHandler(methodName, state.data!!, null)

                state.pushed = true
                if (MPBridgeConfig.debug) {
                    Log.d(MPBridgeConfig.LOG_TAG, "MPDataSyncHelper: pushed data for channel=$channel via method=$methodName")
                }
            }
            if (state == null || state.data == null || !state.pushed) {
                allPushed = false
            }
        }

        if (allPushed && requiredChannels.isNotEmpty()) {
            syncState = SyncState.SYNCED
            if (MPBridgeConfig.debug) {
                Log.d(MPBridgeConfig.LOG_TAG, "MPDataSyncHelper: all data synced!")
            }
        }
    }

    // ========================
    // 状态查询
    // ========================

    /** 检查指定通道的数据是否已推送 */
    fun isDataSynced(channel: String): Boolean {
        return channelStates[channel]?.pushed == true
    }

    /** 检查所有所需通道的数据是否已推送完成 */
    fun isAllDataSynced(): Boolean {
        if (requiredChannels.isEmpty()) return true
        return requiredChannels.all { channel ->
            channelStates[channel]?.pushed == true
        }
    }

    /** 检查指定通道的数据是否已设置 */
    fun hasData(channel: String): Boolean {
        return channelStates[channel]?.data != null
    }

    // ========================
    // 重置
    // ========================

    /**
     * 重置所有状态（加载新页面前调用）
     */
    fun reset() {
        syncState = SyncState.IDLE
        for (state in channelStates.values) {
            state.data = null
            state.pushed = false
        }
        if (MPBridgeConfig.debug) {
            Log.d(MPBridgeConfig.LOG_TAG, "MPDataSyncHelper: reset")
        }
    }
}
