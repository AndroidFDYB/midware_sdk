// AUTO-GENERATED from proto. DO NOT EDIT.

import { getBridge } from '../../bridge';
import { getDataSyncManager } from '../manager';
import { STANDARD_CHANNEL_CONFIGS } from './config.gen';

/**
 * 自动注册标准数据同步 Handler
 *
 * 当 Bridge 就绪后，自动注册以下 JS Handler 供 Native 调用：
 * - syncUserInfo：接收 Native 推送的 UserInfo 数据
 * - syncLoanInfo：接收 Native 推送的 LoanInfo 数据
 * - syncVipInfo：接收 Native 推送的 VipInfo 数据
 *
 * 收到数据后，自动调用 DataSyncManager.pushData() 唤醒等待队列。
 */
export function setupDataSyncHandlers(): void {
  const bridge = getBridge();

  for (const channelConfig of STANDARD_CHANNEL_CONFIGS) {
    const channelName = channelConfig.name;
    const nativeMethod = channelConfig.nativeMethod;

    bridge.register(nativeMethod, (params: any) => {
      let data = params;
      if (typeof params === 'string') {
        try { data = JSON.parse(params); } catch { data = params; }
      }
      getDataSyncManager().pushData(channelName, data);
      return { success: true, channel: channelName };
    });
  }
}
