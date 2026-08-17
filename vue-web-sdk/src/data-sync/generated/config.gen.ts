// AUTO-GENERATED from proto. DO NOT EDIT.

import type { DataChannelConfig } from '../types';

/** 内置标准通道名 */
export const STANDARD_CHANNELS = {
  UserInfo: 'userInfo',
  LoanInfo: 'loanInfo',
  VipInfo: 'vipInfo',
} as const;

/** 内置标准通道配置 */
export const STANDARD_CHANNEL_CONFIGS: DataChannelConfig[] = [
  {
    name: 'userInfo',
    nativeMethod: 'syncUserInfo',
    injectTo: 'headers', headerMap: {"uid":"X-Uid","ticket":"X-Ticket"},
    timeout: 10000,
  },
  {
    name: 'loanInfo',
    nativeMethod: 'syncLoanInfo',
    injectTo: 'body',
    timeout: 10000,
  },
  {
    name: 'vipInfo',
    nativeMethod: 'syncVipInfo',
    injectTo: 'body',
    timeout: 10000,
  },
];
