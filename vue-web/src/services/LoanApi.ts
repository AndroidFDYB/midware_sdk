/**
 * 示例 API 服务 - 演示装饰器 + Axios 拦截器使用方式
 *
 * 这个文件展示前端工程师如何使用 @waitUserInfoSync / @waitLoanInfoSync 等装饰器
 * 来标记需要等待业务数据的 API 方法。
 */

import axios from 'axios'
import type { AxiosInstance } from 'axios'
import {
  setupDataSyncInterceptor,
  waitUserInfoSync,
  waitLoanInfoSync,
  waitVipInfoSync,
  getDataSyncManager,
  type InterceptorConfig,
} from '@mp-sdk/bridge'

// 创建 Axios 实例
const http: AxiosInstance = axios.create({
  baseURL: 'https://api.example.com',
  timeout: 30000,
})

// 数据同步拦截器配置
const interceptorConfig: InterceptorConfig = {
  channels: {
    userInfo: {
      name: 'userInfo',
      nativeMethod: 'syncUserInfo',
      injectTo: 'headers',
      headerMap: { uid: 'X-Uid', ticket: 'X-Ticket' },
      timeout: 15000,
    },
    loanInfo: {
      name: 'loanInfo',
      nativeMethod: 'syncLoanInfo',
      injectTo: 'body',
      timeout: 10000,
    },
    vipInfo: {
      name: 'vipInfo',
      nativeMethod: 'syncVipInfo',
      injectTo: 'body',
      timeout: 10000,
    },
  },
  // 路由模式（可选）：匹配 URL 自动等待
  routes: {
    '/api/loan/*': ['userInfo', 'loanInfo'],
    '/api/vip/*': ['userInfo', 'vipInfo'],
  },
}

// 安装数据同步拦截器（只需调用一次）
setupDataSyncInterceptor(http, interceptorConfig)

/**
 * 借款相关 API
 *
 * 使用装饰器标记方法所需的数据通道：
 * - @waitUserInfoSync：等待 uid + ticket 数据，自动注入请求头
 * - @waitLoanInfoSync：等待借款信息数据，自动注入请求体
 */
export class LoanApi {
  /**
   * 获取借款列表
   * 装饰器会阻塞请求，等待 userInfo 和 loanInfo 数据到达后发送
   */
  @waitUserInfoSync
  @waitLoanInfoSync
  async getLoanList() {
    return http.get('/api/loan/list')
  }

  /**
   * 获取借款详情
   */
  @waitUserInfoSync
  @waitLoanInfoSync
  async getLoanDetail(id: string) {
    return http.get(`/api/loan/${id}`)
  }
}

/**
 * 会员相关 API
 */
export class VipApi {
  @waitUserInfoSync
  @waitVipInfoSync
  async getVipBenefits() {
    return http.get('/api/vip/benefits')
  }
}

// 导出单例
export const loanApi = new LoanApi()
export const vipApi = new VipApi()

// 导出数据同步管理器（用于 UI 显示状态）
export { getDataSyncManager }
