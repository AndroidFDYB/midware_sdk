/**
 * 鸿蒙端 Proto Codegen 脚本
 *
 * 解析 .proto 文件，生成 ArkTS 源码（通道常量、方法映射、setter）。
 * 在 build-harmony.js 之前执行，确保产物在 hvigor 编译前就绪。
 *
 * 用法：
 *   node scripts/proto-codegen-harmony.js
 */

const path = require('path');
const fs = require('fs');
const { parseProtoFile, collectProtoFiles } = require('@mp-sdk/proto-codegen');

// 命名约定工具（与 TS 版本逻辑一致）
function toCamelCase(pascalCase) {
  if (!pascalCase) return '';
  return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);
}

function toUpperSnakeCase(pascalCase) {
  if (!pascalCase) return '';
  let result = '';
  for (let i = 0; i < pascalCase.length; i++) {
    const c = pascalCase[i];
    if (i > 0 && c >= 'A' && c <= 'Z') {
      result += '_';
    }
    result += c.toUpperCase();
  }
  return result;
}

function messageToChannel(name) { return toCamelCase(name); }
function messageToSyncMethod(name) { return `sync${name}`; }
function messageToConstantName(name) { return toUpperSnakeCase(name); }
function messageToMethodConstantName(name) { return `SYNC_${toUpperSnakeCase(name)}`; }
function messageToSetterName(name) { return `set${name}`; }

const ROOT = path.resolve(__dirname, '..');
const PROTO_FILE = path.join(ROOT, 'specs', 'proto', 'channels.proto');
const CUSTOM_DIR = path.join(ROOT, 'specs', 'proto', 'custom');
const OUTPUT_DIR = path.join(ROOT, 'hm', 'hm_web_library', 'src', 'main', 'ets', 'generated');

function generate() {
  console.log('[ProtoCodegen/Harmony] Parsing:', PROTO_FILE);

  // 确保输出目录存在
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 解析主 proto 文件
  const mainResult = parseProtoFile(PROTO_FILE);
  let allMessages = [...mainResult.file.messages];

  for (const warning of mainResult.warnings) {
    console.warn(`[ProtoCodegen/Harmony] WARNING: ${warning}`);
  }

  // 解析 custom 目录
  if (fs.existsSync(CUSTOM_DIR)) {
    const customFiles = collectProtoFiles(CUSTOM_DIR);
    for (const customFile of customFiles) {
      console.log('[ProtoCodegen/Harmony] Parsing custom:', customFile);
      const customResult = parseProtoFile(customFile);
      allMessages.push(...customResult.file.messages);
      for (const warning of customResult.warnings) {
        console.warn(`[ProtoCodegen/Harmony] WARNING: ${warning}`);
      }
    }
  }

  // 去重
  const uniqueMessages = allMessages.filter((msg, idx, self) =>
    idx === self.findIndex(m => m.name === msg.name)
  );

  console.log(`[ProtoCodegen/Harmony] Found ${uniqueMessages.length} messages: ${uniqueMessages.map(m => m.name).join(', ')}`);

  // 生成 DataSyncChannels.ets
  const channelsCode = generateChannelsEts(uniqueMessages);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'DataSyncChannels.ets'), channelsCode);
  console.log('[ProtoCodegen/Harmony] Generated DataSyncChannels.ets');

  // 生成 DataSyncMethods.ets
  const methodsCode = generateMethodsEts(uniqueMessages);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'DataSyncMethods.ets'), methodsCode);
  console.log('[ProtoCodegen/Harmony] Generated DataSyncMethods.ets');

  // 生成 DataSyncSetters.ets
  const settersCode = generateSettersEts(uniqueMessages);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'DataSyncSetters.ets'), settersCode);
  console.log('[ProtoCodegen/Harmony] Generated DataSyncSetters.ets');

  console.log('[ProtoCodegen/Harmony] Done.');
}

/**
 * 生成 DataSyncChannels.ets
 */
function generateChannelsEts(messages) {
  const constants = messages.map(msg => {
    const constName = messageToConstantName(msg.name);
    const channelValue = messageToChannel(msg.name);
    return `  static readonly ${constName}: string = '${channelValue}';`;
  }).join('\n');

  return `// AUTO-GENERATED from proto. DO NOT EDIT.

/**
 * 标准数据通道名称
 * 由 proto codegen 自动生成
 */
export class DataSyncChannel {
${constants}
}
`;
}

/**
 * 生成 DataSyncMethods.ets
 */
function generateMethodsEts(messages) {
  const constants = messages.map(msg => {
    const constName = messageToMethodConstantName(msg.name);
    const methodValue = messageToSyncMethod(msg.name);
    return `  static readonly ${constName}: string = '${methodValue}';`;
  }).join('\n');

  const cases = messages.map(msg => {
    const constName = messageToConstantName(msg.name);
    const methodConstName = messageToMethodConstantName(msg.name);
    return `      case DataSyncChannel.${constName}:\n        return DataSyncMethod.${methodConstName};`;
  }).join('\n');

  return `// AUTO-GENERATED from proto. DO NOT EDIT.

import { DataSyncChannel } from './DataSyncChannels';

/**
 * Native → JS 推送数据时调用的 JSBridge 方法名
 * 由 proto codegen 自动生成
 */
export class DataSyncMethod {
${constants}

  /**
   * 根据通道名获取对应的 JSBridge 方法名
   * 标准通道使用预定义方法名，自定义通道自动生成 "syncXxx" 格式
   */
  static fromChannel(channel: string): string {
    switch (channel) {
${cases}
      default: {
        const capitalized = channel.charAt(0).toUpperCase() + channel.slice(1);
        return \`sync\${capitalized}\`;
      }
    }
  }
}
`;
}

/**
 * 生成 DataSyncSetters.ets
 *
 * setter 扩展函数，由 DataSyncHelper 调用方使用。
 */
function generateSettersEts(messages) {
  const setters = messages.map(msg => {
    const setterName = messageToSetterName(msg.name);
    const constName = messageToConstantName(msg.name);
    const comment = msg.comment || `设置 ${msg.name} 数据`;
    return `  /** ${comment} */\n  ${setterName}(data: string): void {\n    this.setData(DataSyncChannel.${constName}, data);\n  }`;
  }).join('\n\n');

  return `// AUTO-GENERATED from proto. DO NOT EDIT.

import { DataSyncChannel } from './DataSyncChannels';

/**
 * DataSyncHelper 的 setter 抽象基类
 * 由 proto codegen 自动生成
 * DataSyncHelper 继承此类，提供 setData() 实现
 */
export abstract class DataSyncSetters {
  /** 子类实现：设置指定通道的业务数据 */
  abstract setData(channel: string, data: string): void;

${setters}
}
`;
}

// 运行生成
generate();
