<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { bridge, getPlatform, getPlatformDebugInfo, getDataSyncManager, type Platform } from '@mp-sdk/bridge'
import { loanApi, vipApi } from './services/LoanApi'

const platform = ref<Platform>('unknown')
const bridgeStatus = ref('checking...')
const callResult = ref('')

// 数据同步状态
const syncStatus = reactive({
  userInfo: { ready: false, data: null as any, waiters: 0 },
  loanInfo: { ready: false, data: null as any, waiters: 0 },
  vipInfo: { ready: false, data: null as any, waiters: 0 },
})

// 请求状态
const requestStatus = ref('idle')
const requestLog = ref<string[]>([])

function addLog(message: string) {
  const time = new Date().toLocaleTimeString()
  requestLog.value.unshift(`[${time}] ${message}`)
  if (requestLog.value.length > 10) requestLog.value.pop()
}

onMounted(() => {
  platform.value = getPlatform()
  bridgeStatus.value = bridge.hasNativeBridge() ? 'connected' : 'standalone (no native bridge)'

  // 注册 JS 端方法供 Native 调用
  bridge.register('onMessage', (params: any) => {
    callResult.value = `Received from Native: ${JSON.stringify(params)}`
    return { received: true }
  })

  updateSyncStatus()
})

function updateSyncStatus() {
  const manager = getDataSyncManager()
  for (const channel of ['userInfo', 'loanInfo', 'vipInfo'] as const) {
    syncStatus[channel].ready = manager.isReady(channel)
    syncStatus[channel].data = manager.getData(channel)
    syncStatus[channel].waiters = manager.getWaiterCount(channel)
  }
}

// 模拟 Native 推送数据（在纯 Web 模式下用于演示）
function simulatePushData(channel: string) {
  const manager = getDataSyncManager()
  let data: any

  switch (channel) {
    case 'userInfo':
      data = { uid: 'user_12345', ticket: 'ticket_abc_def_123' }
      break
    case 'loanInfo':
      data = { loanId: 'L001', amount: 50000, period: 12, rate: 0.05 }
      break
    case 'vipInfo':
      data = { vipLevel: 3, points: 1500, expireDate: '2026-12-31' }
      break
    default:
      return
  }

  manager.pushData(channel, data)
  addLog(`Data pushed to "${channel}": ${JSON.stringify(data)}`)
  updateSyncStatus()
}

// 清除数据（模拟重新同步）
function clearData(channel: string) {
  getDataSyncManager().clearData(channel)
  addLog(`Data cleared on "${channel}"`)
  updateSyncStatus()
}

// 调用带装饰器的 API
async function callDecoratedApi(apiName: string) {
  requestStatus.value = 'calling...'
  addLog(`Calling ${apiName}... (decorators will block until data is ready)`)

  try {
    let promise: Promise<any>

    if (apiName === 'getLoanList') {
      promise = loanApi.getLoanList()
    } else if (apiName === 'getVipBenefits') {
      promise = vipApi.getVipBenefits()
    } else {
      return
    }

    // 设置超时（模拟）
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout (demo)')), 5000)
    )

    try {
      await Promise.race([promise, timeoutPromise])
      addLog(`${apiName} completed (request sent with synced data)`)
    } catch (err: any) {
      if (err.message?.includes('timed out')) {
        addLog(`${apiName} blocked: data sync timeout - channel data not available`)
      } else {
        addLog(`${apiName} completed (network error expected in demo)`)
      }
    }
  } finally {
    requestStatus.value = 'idle'
    updateSyncStatus()
  }
}

function showPlatformInfo() {
  const info = getPlatformDebugInfo()
  callResult.value = JSON.stringify(info, null, 2)
}

function testCallNative() {
  if (!bridge.hasNativeBridge()) {
    callResult.value = 'No native bridge available (running in pure web mode)'
    return
  }
  const result = bridge.call('echo', { message: 'Hello from JS!' })
  callResult.value = `Native response: ${JSON.stringify(result)}`
}

async function testAsyncCallNative() {
  if (!bridge.hasNativeBridge()) {
    callResult.value = 'No native bridge available (running in pure web mode)'
    return
  }
  const result = await bridge.callAsync('asyncEcho', { message: 'Hello async!' })
  callResult.value = `Async response: ${JSON.stringify(result)}`
}
</script>

<template>
  <div style="padding: 20px; font-family: sans-serif; max-width: 900px; margin: 0 auto;">
    <h1>MPBridge SDK - Data Sync Demo</h1>

    <!-- 平台信息 -->
    <div style="margin: 16px 0; padding: 16px; background: #f0f7ff; border-radius: 8px;">
      <h3>Platform Detection</h3>
      <p><strong>Platform:</strong> {{ platform }}</p>
      <p><strong>Bridge Status:</strong> {{ bridgeStatus }}</p>
      <button @click="showPlatformInfo" style="margin-right: 8px;">Show Debug Info</button>
      <button @click="testCallNative" style="margin-right: 8px;">Sync Call</button>
      <button @click="testAsyncCallNative">Async Call</button>
    </div>

    <!-- 数据同步状态 -->
    <div style="margin: 16px 0; padding: 16px; background: #fff8e1; border-radius: 8px;">
      <h3>Data Sync Channels</h3>
      <p style="color: #666; font-size: 14px;">
        Simulate Native pushing data via JSBridge. In production, Native calls
        <code>callBridgeHandler("syncUserInfo", data)</code> (Android) or
        <code>callJs("syncUserInfo", [data])</code> (HarmonyOS).
      </p>

      <div v-for="channel in (['userInfo', 'loanInfo', 'vipInfo'] as const)" :key="channel"
           style="margin: 8px 0; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-weight: bold; min-width: 100px;">{{ channel }}</span>
          <span :style="{ color: syncStatus[channel].ready ? 'green' : 'red' }">
            {{ syncStatus[channel].ready ? 'READY' : 'WAITING' }}
          </span>
          <span v-if="syncStatus[channel].waiters > 0" style="color: #ff9800;">
            ({{ syncStatus[channel].waiters }} requests waiting)
          </span>
          <button v-if="!syncStatus[channel].ready"
                  @click="simulatePushData(channel)"
                  style="margin-left: auto; padding: 4px 12px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Push Data
          </button>
          <button v-else
                  @click="clearData(channel)"
                  style="margin-left: auto; padding: 4px 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Clear
          </button>
        </div>
        <div v-if="syncStatus[channel].data" style="margin-top: 4px; font-size: 12px; color: #666;">
          {{ JSON.stringify(syncStatus[channel].data) }}
        </div>
      </div>
    </div>

    <!-- API 调用测试 -->
    <div style="margin: 16px 0; padding: 16px; background: #e8f5e9; border-radius: 8px;">
      <h3>Decorated API Methods</h3>
      <p style="color: #666; font-size: 14px;">
        These methods use <code>@waitUserInfoSync</code> / <code>@waitLoanInfoSync</code> / <code>@waitVipInfoSync</code>
        decorators. Requests will block until data is ready or timeout.
      </p>
      <button @click="callDecoratedApi('getLoanList')"
              :disabled="requestStatus !== 'idle'"
              style="margin-right: 8px; padding: 8px 16px; cursor: pointer;">
        Call getLoanList()
        <span style="font-size: 11px; color: #666;">(@waitUserInfoSync + @waitLoanInfoSync)</span>
      </button>
      <button @click="callDecoratedApi('getVipBenefits')"
              :disabled="requestStatus !== 'idle'"
              style="padding: 8px 16px; cursor: pointer;">
        Call getVipBenefits()
        <span style="font-size: 11px; color: #666;">(@waitUserInfoSync + @waitVipInfoSync)</span>
      </button>
    </div>

    <!-- 请求日志 -->
    <div v-if="requestLog.length > 0" style="margin: 16px 0; padding: 16px; background: #f5f5f5; border-radius: 8px;">
      <h3>Request Log</h3>
      <div v-for="(log, i) in requestLog" :key="i" style="font-family: monospace; font-size: 13px; margin: 4px 0;">
        {{ log }}
      </div>
    </div>

    <!-- 结果 -->
    <div v-if="callResult" style="margin-top: 16px; padding: 12px; background: #f5f5f5; border-radius: 4px;">
      <strong>Result:</strong>
      <pre style="white-space: pre-wrap; margin-top: 8px;">{{ callResult }}</pre>
    </div>
  </div>
</template>
