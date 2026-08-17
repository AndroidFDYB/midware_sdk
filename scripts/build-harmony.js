/**
 * 鸿蒙 HAR 构建脚本
 *
 * 使用 DevEco Studio 自带的 node + hvigor 构建工具编译 hm_web_library 模块
 * 构建命令格式参考：
 *   "DevEco Studio/tools/node/node.exe" "DevEco Studio/tools/hvigor/bin/hvigorw.js"
 *     --mode module -p product=default assembleHap ...
 *
 * 本脚本构建的是 HAR 库，使用 assembleHar 任务
 */

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HM_DIR = path.join(ROOT, 'hm');

// DevEco Studio 安装路径
const DEVECO_HOME = process.env.DEVECO_HOME || 'D:\\software\\DevEco Studio';

// 鸿蒙 SDK 路径
const HOS_SDK = process.env.HOS_SDK_HOME || path.join(DEVECO_HOME, 'sdk');

// DevEco Studio 自带的 node 和 hvigor
const DEVECO_NODE = path.join(DEVECO_HOME, 'tools', 'node', 'node.exe');
const HVIGORW_JS = path.join(DEVECO_HOME, 'tools', 'hvigor', 'bin', 'hvigorw.js');

console.log('[Build] HarmonyOS - Building hm_web_library HAR...');
console.log(`  HM_DIR:      ${HM_DIR}`);
console.log(`  DEVECO_HOME: ${DEVECO_HOME}`);
console.log(`  HOS_SDK:     ${HOS_SDK}`);
console.log(`  NODE:        ${DEVECO_NODE}`);
console.log(`  HVIGORW:     ${HVIGORW_JS}`);

// 验证构建工具是否存在
const fs = require('fs');
if (!fs.existsSync(DEVECO_NODE)) {
  console.error(`[Build] ERROR: DevEco Studio node not found: ${DEVECO_NODE}`);
  console.error('  Set DEVECO_HOME environment variable to your DevEco Studio installation path.');
  process.exit(1);
}
if (!fs.existsSync(HVIGORW_JS)) {
  console.error(`[Build] ERROR: hvigorw.js not found: ${HVIGORW_JS}`);
  process.exit(1);
}

try {
  // 先运行 proto codegen 生成 ArkTS 源码
  console.log('[Build] Running proto codegen...');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'proto-codegen-harmony.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  // 使用 DevEco Studio 的 node 执行 hvigorw.js
  // 构建 hm_web_library 模块的 HAR 产物
  const args = [
    HVIGORW_JS,
    '--mode', 'module',
    '-p', 'module=hm_web_library@default',
    'assembleHar',
    '--analyze=normal',
    '--parallel',
    '--incremental',
    '--daemon'
  ];

  console.log(`  Running: "${DEVECO_NODE}" ${args.join(' ')}`);
  execFileSync(DEVECO_NODE, args, {
    cwd: HM_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      HOS_SDK_HOME: HOS_SDK,
    },
  });

  console.log('[Build] HarmonyOS build completed successfully.');
} catch (error) {
  console.error('[Build] HarmonyOS build failed:', error.message);
  console.error('  Please ensure:');
  console.error(`  1. DevEco Studio is installed at: ${DEVECO_HOME}`);
  console.error(`  2. Node exists at: ${DEVECO_NODE}`);
  console.error(`  3. hvigorw.js exists at: ${HVIGORW_JS}`);
  console.error('  4. Set DEVECO_HOME or HOS_SDK_HOME environment variable if paths differ');
  process.exit(1);
}
