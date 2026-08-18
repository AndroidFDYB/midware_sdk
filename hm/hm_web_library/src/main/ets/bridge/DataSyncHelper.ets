/**
 * 数据同步辅助器
 *
 * 鸿蒙端业务数据同步管理器，解决 WebView 中 Native → Web 大数据量传递的时序问题。
 *
 * 与 Android 端 MPDataSyncHelper 功能对等，但因鸿蒙 AOP 能力较差，
 * 不使用注解方式，而是由调用方直接声明所需数据通道。
 *
 * 数据推送时机：
 * 1. 页面已加载 + 数据已就绪 → 立即推送
 * 2. 页面已加载 + 数据未就绪 → 等待数据到达后推送
 * 3. 页面未加载 + 数据已就绪 → 等待页面加载完成后推送
 *
 * 使用方式：
 * ```typescript
 * import { DataSyncHelper, DataSyncChannel, JSBridgeManager } from 'hm_web_library';
 *
 * @Entry
 * @Component
 * struct LoanPage {
 *   private bridgeManager: JSBridgeManager = new JSBridgeManager(true);
 *   private dataSyncHelper: DataSyncHelper = new DataSyncHelper(
 *     this.bridgeManager,
 *     [DataSyncChannel.USER_INFO, DataSyncChannel.LOAN_INFO],
 *     true
 *   );
 *
 *   build() {
 *     MPBridgeWeb({
 *       bridgeManager: this.bridgeManager,
 *       url: 'https://example.com/loan',
 *       debug: true,
 *       dataSyncHelper: this.dataSyncHelper,
 *       controller: this.controller
 *     })
 *   }
 *
 *   aboutToAppear() {
 *     // 设置业务数据（可在页面加载前或后）
 *     this.dataSyncHelper.setUserInfo('{"uid":"123","ticket":"abc"}');
 *     this.dataSyncHelper.setLoanInfo('{"loanId":"L001","amount":50000}');
 *   }
 * }
 * ```
 */

import { JSBridgeManager } from './JSBridge';
import { DataSyncChannel } from '../generated/DataSyncChannels';
import { DataSyncMethod } from '../generated/DataSyncMethods';
import { DataSyncSetters } from '../generated/DataSyncSetters';

// ========================
// 同步状态枚举
// ========================

/**
 * WebView 数据同步状态
 * IDLE → LOADING → LOADED → SYNCED
 */
export enum SyncState {
  /** 初始状态 */
  IDLE,
  /** 页面加载中 */
  LOADING,
  /** 页面已加载，等待或正在推送数据 */
  LOADED,
  /** 所有数据已推送完成 */
  SYNCED,
}

// ========================
// 单通道状态
// ========================

/**
 * 单个数据通道的状态
 */
class ChannelState {
  /** 业务数据 JSON 字符串，null 表示尚未设置 */
  data: string | null = null;
  /** 是否已推送到 JS */
  pushed: boolean = false;
}

// ========================
// DataSyncHelper
// ========================

/**
 * 鸿蒙端数据同步辅助器
 *
 * 管理页面加载状态和各通道数据推送状态，
 * 在「页面加载完成」+「数据就绪」时自动通过 JSBridge 推送数据到前端。
 *
 * 因鸿蒙 AOP 能力较差，不使用注解方式，
 * 调用方在构造时直接传入所需的数据通道列表。
 */
export class DataSyncHelper extends DataSyncSetters {
  /** JSBridge 管理器，用于调用 JS 方法推送数据 */
  private bridgeManager: JSBridgeManager;

  /** 所需数据通道列表（由调用方声明） */
  private requiredChannels: Set<string> = new Set();

  /** 各通道状态 */
  private channelStates: Map<string, ChannelState> = new Map();

  /** 当前同步状态 */
  private syncState: SyncState = SyncState.IDLE;

  /** 调试模式 */
  private debug: boolean = false;

  /**
   * 构造函数
   *
   * @param bridgeManager JSBridge 管理器实例
   * @param requiredChannels 所需数据通道列表（如 [DataSyncChannel.USER_INFO, DataSyncChannel.LOAN_INFO]）
   * @param debug 是否开启调试日志
   */
  constructor(
    bridgeManager: JSBridgeManager,
    requiredChannels: string[] = [],
    debug: boolean = false
  ) {
    super();
    this.bridgeManager = bridgeManager;
    this.debug = debug;
    this.requiredChannels = new Set(requiredChannels);

    // 初始化所需通道的状态
    for (const channel of this.requiredChannels) {
      this.channelStates.set(channel, new ChannelState());
    }

    this.log(`DataSyncHelper created, requiredChannels=${JSON.stringify(requiredChannels)}`);
  }

  /** 获取所需数据通道列表 */
  getRequiredChannels(): string[] {
    return Array.from(this.requiredChannels);
  }

  /** 获取当前同步状态 */
  getSyncState(): SyncState {
    return this.syncState;
  }

  // ========================
  // 页面加载通知
  // ========================

  /**
   * 通知页面已加载完成
   * 应在 Web 组件的 onPageEnd 回调中调用
   * 触发推送已就绪的业务数据到前端
   */
  notifyPageLoaded(): void {
    if (this.syncState === SyncState.LOADING || this.syncState === SyncState.IDLE) {
      this.syncState = SyncState.LOADED;
      this.log('page loaded, checking pending data');
      this.pushPendingData();
    }
  }

  /**
   * 通知页面开始加载
   * 应在 Web 组件的 onPageBegin 回调中调用
   * 重置推送状态（新页面需要重新推送）
   */
  notifyPageLoading(): void {
    this.syncState = SyncState.LOADING;
    // 重置推送状态
    for (const state of this.channelStates.values()) {
      state.pushed = false;
    }
  }

  // ========================
  // 设置业务数据
  // ========================

  // setUserInfo / setLoanInfo / setVipInfo 由 proto codegen 生成（DataSyncSetters 基类）

  /**
   * 设置指定通道的业务数据
   * 如果页面已加载，会立即尝试推送
   *
   * @param channel 通道名称
   * @param data JSON 字符串
   */
  setData(channel: string, data: string): void {
    let state = this.channelStates.get(channel);
    if (!state) {
      state = new ChannelState();
      this.channelStates.set(channel, state);
      // 动态添加通道到所需列表
      this.requiredChannels.add(channel);
    }
    state.data = data;
    state.pushed = false;

    this.log(`data set for channel=${channel}, pending push`);

    // 页面已加载则立即推送
    if (this.syncState === SyncState.LOADED) {
      this.pushPendingData();
    }
  }

  // ========================
  // 数据推送
  // ========================

  /**
   * 推送所有待推送的数据
   * 仅推送 requiredChannels 中标记为需要且数据已就绪但尚未推送的通道
   */
  private pushPendingData(): void {
    let allPushed = true;

    for (const channel of this.requiredChannels) {
      const state = this.channelStates.get(channel);
      if (state && state.data != null && !state.pushed) {
        const methodName = DataSyncMethod.fromChannel(channel);
        // 通过 JSBridge 调用 JS 端注册的数据同步 Handler
        this.bridgeManager.callJs(methodName, [state.data]);

        state.pushed = true;
        this.log(`pushed data for channel=${channel} via method=${methodName}`);
      }
      if (!state || state.data == null || !state.pushed) {
        allPushed = false;
      }
    }

    if (allPushed && this.requiredChannels.size > 0) {
      this.syncState = SyncState.SYNCED;
      this.log('all data synced!');
    }
  }

  // ========================
  // 状态查询
  // ========================

  /** 检查指定通道的数据是否已推送 */
  isDataSynced(channel: string): boolean {
    const state = this.channelStates.get(channel);
    return state ? state.pushed : false;
  }

  /** 检查所有所需通道的数据是否已推送完成 */
  isAllDataSynced(): boolean {
    if (this.requiredChannels.size === 0) return true;
    for (const channel of this.requiredChannels) {
      const state = this.channelStates.get(channel);
      if (!state || !state.pushed) return false;
    }
    return true;
  }

  /** 检查指定通道的数据是否已设置 */
  hasData(channel: string): boolean {
    const state = this.channelStates.get(channel);
    return state ? state.data != null : false;
  }

  // ========================
  // 重置
  // ========================

  /**
   * 重置所有状态（加载新页面前调用）
   */
  reset(): void {
    this.syncState = SyncState.IDLE;
    for (const state of this.channelStates.values()) {
      state.data = null;
      state.pushed = false;
    }
    this.log('reset');
  }

  // ========================
  // 日志
  // ========================

  private log(msg: string): void {
    if (this.debug) {
      console.log(`[MPBridge/DataSync] ${msg}`);
    }
  }
}
