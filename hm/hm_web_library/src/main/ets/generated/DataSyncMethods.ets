// AUTO-GENERATED from proto. DO NOT EDIT.

/**
 * Native → JS 推送数据时调用的 JSBridge 方法名
 * 由 proto codegen 自动生成
 */
export class DataSyncMethod {
  static readonly SYNC_USER_INFO: string = 'syncUserInfo';
  static readonly SYNC_LOAN_INFO: string = 'syncLoanInfo';
  static readonly SYNC_VIP_INFO: string = 'syncVipInfo';

  /**
   * 根据通道名获取对应的 JSBridge 方法名
   * 标准通道使用预定义方法名，自定义通道自动生成 "syncXxx" 格式
   */
  static fromChannel(channel: string): string {
    switch (channel) {
      case DataSyncChannel.USER_INFO:
        return DataSyncMethod.SYNC_USER_INFO;
      case DataSyncChannel.LOAN_INFO:
        return DataSyncMethod.SYNC_LOAN_INFO;
      case DataSyncChannel.VIP_INFO:
        return DataSyncMethod.SYNC_VIP_INFO;
      default: {
        const capitalized = channel.charAt(0).toUpperCase() + channel.slice(1);
        return `sync${capitalized}`;
      }
    }
  }
}
