/**
 * 代码生成器：从 Proto 模型生成 TypeScript 源码
 *
 * 生成产物：
 *   - types.gen.ts     — TypeScript 接口定义（数据结构）
 *   - config.gen.ts    — 通道配置（名称、方法名、inject 默认值）
 *   - decorators.gen.ts — 装饰器导出
 *   - handlers.gen.ts  — JSBridge Handler 注册函数
 */

import type { ProtoMessage, ProtoField } from '@mp-sdk/proto-codegen';
import {
  messageToChannel,
  messageToSyncMethod,
  messageToDecoratorName,
  protoTypeToTs,
} from '@mp-sdk/proto-codegen';

/** 默认 inject 配置（SDK 内部定义，非 proto 来源） */
const DEFAULT_INJECT_CONFIG: Record<string, { injectTo: string; headerMap?: Record<string, string> }> = {
  userInfo: { injectTo: 'headers', headerMap: { uid: 'X-Uid', ticket: 'X-Ticket' } },
  loanInfo: { injectTo: 'body' },
  vipInfo: { injectTo: 'body' },
};

/**
 * 生成 TypeScript 接口定义
 *
 * UserInfo → export interface UserInfo { uid: string; ... }
 */
export function generateTypes(messages: ProtoMessage[]): string {
  const interfaces = messages.map((msg) => {
    const fields = msg.fields.map((f: ProtoField) => {
      const tsType = protoTypeToTs(f.type);
      const typeStr = f.repeated ? `${tsType}[]` : tsType;
      const comment = f.comment ? `  /** ${f.comment} */\n` : '';
      return `${comment}  ${f.name}: ${typeStr};`;
    });
    const comment = msg.comment ? `/** ${msg.comment} */\n` : '';
    return `${comment}export interface ${msg.name} {\n${fields.join('\n')}\n}`;
  });

  return `// AUTO-GENERATED from proto. DO NOT EDIT.

${interfaces.join('\n\n')}
`;
}

/**
 * 生成通道配置
 *
 * 包含 name, nativeMethod, injectTo, headerMap, timeout。
 * injectTo 和 headerMap 为 SDK 默认值（非 proto 来源），可被消费者覆盖。
 */
export function generateConfig(messages: ProtoMessage[]): string {
  const configs = messages.map((msg) => {
    const channel = messageToChannel(msg.name);
    const nativeMethod = messageToSyncMethod(msg.name);
    const defaultCfg = DEFAULT_INJECT_CONFIG[channel] || { injectTo: 'body' };
    const headerMapStr = defaultCfg.headerMap
      ? `, headerMap: ${JSON.stringify(defaultCfg.headerMap)}`
      : '';
    return `  {
    name: '${channel}',
    nativeMethod: '${nativeMethod}',
    injectTo: '${defaultCfg.injectTo}'${headerMapStr},
    timeout: 10000,
  }`;
  });

  const channelNames = messages.map((msg) => `  ${messageToDecoratorName(msg.name).replace('wait', '').replace('Sync', '')}: '${messageToChannel(msg.name)}'`);

  return `// AUTO-GENERATED from proto. DO NOT EDIT.

import type { DataChannelConfig } from '../types';

/** 内置标准通道名 */
export const STANDARD_CHANNELS = {
${channelNames.join(',\n')},
} as const;

/** 内置标准通道配置 */
export const STANDARD_CHANNEL_CONFIGS: DataChannelConfig[] = [
${configs.join(',\n')},
];
`;
}

/**
 * 生成装饰器导出
 *
 * @waitUserInfoSync, @waitLoanInfoSync, @waitVipInfoSync 等
 */
export function generateDecorators(messages: ProtoMessage[]): string {
  const decorators = messages.map((msg) => {
    const decoratorName = messageToDecoratorName(msg.name);
    const channel = messageToChannel(msg.name);
    return `export const ${decoratorName}: MethodDecorator = waitDataSync('${channel}');`;
  });

  return `// AUTO-GENERATED from proto. DO NOT EDIT.

import { waitDataSync } from '../decorators';

${decorators.join('\n')}
`;
}

/**
 * 生成 JSBridge Handler 注册函数
 *
 * setupDataSyncHandlers() — 注册 syncUserInfo/syncLoanInfo/syncVipInfo 等 Handler
 */
export function generateHandlers(messages: ProtoMessage[]): string {
  return `// AUTO-GENERATED from proto. DO NOT EDIT.

import { getBridge } from '../../bridge';
import { getDataSyncManager } from '../manager';
import { STANDARD_CHANNEL_CONFIGS } from './config.gen';

/**
 * 自动注册标准数据同步 Handler
 *
 * 当 Bridge 就绪后，自动注册以下 JS Handler 供 Native 调用：
${messages.map((msg) => ` * - ${messageToSyncMethod(msg.name)}：接收 Native 推送的 ${msg.name} 数据`).join('\n')}
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
`;
}

/**
 * 生成所有文件
 */
export function generateAllFiles(messages: ProtoMessage[]): Record<string, string> {
  return {
    'types.gen.ts': generateTypes(messages),
    'config.gen.ts': generateConfig(messages),
    'decorators.gen.ts': generateDecorators(messages),
    'handlers.gen.ts': generateHandlers(messages),
  };
}
