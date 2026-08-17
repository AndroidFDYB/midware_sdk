/**
 * 构建后处理脚本
 *
 * 将各平台构建产物拷贝到统一的 output/ 目录
 *
 * 用法：node scripts/post-build.js <platform>
 *   platform: android | harmony | web
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log(`  Copied: ${src} -> ${dest}`);
}

function findFiles(dir, ext) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

function postBuildAndroid() {
  console.log('\n[Post-Build] Android - Collecting AAR...');
  const outputDir = path.join(OUTPUT_DIR, 'android');
  ensureDir(outputDir);

  const aarDir = path.join(ROOT, 'android', 'and_web_library', 'build', 'outputs', 'aar');
  const aarFiles = findFiles(aarDir, '.aar');

  if (aarFiles.length === 0) {
    console.error('  ERROR: No AAR files found in', aarDir);
    process.exit(1);
  }

  for (const aar of aarFiles) {
    const destName = path.basename(aar);
    copyFile(aar, path.join(outputDir, destName));
  }
  console.log('  Android build output collected successfully.');
}

function postBuildHarmony() {
  console.log('\n[Post-Build] HarmonyOS - Collecting HAR...');
  const outputDir = path.join(OUTPUT_DIR, 'harmony');
  ensureDir(outputDir);

  const harDir = path.join(ROOT, 'hm', 'hm_web_library', 'build', 'default', 'outputs', 'default');
  const harFiles = findFiles(harDir, '.har');

  if (harFiles.length === 0) {
    // 尝试其他可能的输出路径
    const altHarDir = path.join(ROOT, 'hm', 'build', 'outputs');
    const altHarFiles = findFiles(altHarDir, '.har');
    if (altHarFiles.length === 0) {
      console.error('  ERROR: No HAR files found');
      process.exit(1);
    }
    for (const har of altHarFiles) {
      copyFile(har, path.join(outputDir, path.basename(har)));
    }
  } else {
    for (const har of harFiles) {
      copyFile(har, path.join(outputDir, path.basename(har)));
    }
  }
  console.log('  HarmonyOS build output collected successfully.');
}

function postBuildWeb() {
  console.log('\n[Post-Build] Web - Collecting TGZ...');
  const outputDir = path.join(OUTPUT_DIR, 'web');
  ensureDir(outputDir);

  const tgzDir = path.join(ROOT, 'vue-web-sdk');
  const tgzFiles = findFiles(tgzDir, '.tgz');

  if (tgzFiles.length === 0) {
    console.error('  ERROR: No TGZ files found in', tgzDir);
    process.exit(1);
  }

  for (const tgz of tgzFiles) {
    copyFile(tgz, path.join(outputDir, path.basename(tgz)));
  }
  console.log('  Web SDK build output collected successfully.');
}

// Main
const platform = process.argv[2];
if (!platform) {
  console.error('Usage: node scripts/post-build.js <platform>');
  console.error('  platform: android | harmony | web');
  process.exit(1);
}

switch (platform) {
  case 'android':
    postBuildAndroid();
    break;
  case 'harmony':
    postBuildHarmony();
    break;
  case 'web':
    postBuildWeb();
    break;
  default:
    console.error(`Unknown platform: ${platform}`);
    process.exit(1);
}
