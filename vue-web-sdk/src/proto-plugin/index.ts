/**
 * Vite 插件：MP-SDK Proto Codegen
 *
 * 解析 .proto 文件，自动生成 TypeScript 源码（接口、装饰器、配置、Handler）。
 * 开发模式下 watch proto 文件变化，自动重新生成并触发 HMR。
 *
 * 用法（在 vite.config.ts 中）：
 * ```typescript
 * import { defineConfig } from 'vite';
 * import { mpProtoPlugin } from './src/proto-plugin';
 *
 * export default defineConfig({
 *   plugins: [mpProtoPlugin({
 *     protoFile: '../specs/proto/channels.proto',
 *     customProtoDir: '../specs/proto/custom',
 *     outputDir: './src/data-sync/generated',
 *   })],
 * });
 * ```
 */

import type { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';
import { parseProtoFile, collectProtoFiles } from '@mp-sdk/proto-codegen';
import type { ProtoMessage } from '@mp-sdk/proto-codegen';
import { generateAllFiles } from './generators';

export interface MpProtoPluginOptions {
  /** .proto 文件路径（相对 vite.config.ts） */
  protoFile: string;
  /** 自定义 .proto 目录路径（可选） */
  customProtoDir?: string;
  /** 生成文件输出目录（相对 vite.config.ts） */
  outputDir: string;
  /** 是否启用 watch（开发模式，默认 true） */
  watch?: boolean;
}

/**
 * Vite 插件入口
 */
export function mpProtoPlugin(options: MpProtoPluginOptions): Plugin {
  const { protoFile, customProtoDir, outputDir, watch = true } = options;

  let rootDir: string;

  /** 解析 proto 并生成文件 */
  function generate(root: string) {
    rootDir = root;
    const protoFilePath = path.resolve(root, protoFile);
    const outputDirAbs = path.resolve(root, outputDir);

    // 确保输出目录存在
    fs.mkdirSync(outputDirAbs, { recursive: true });

    // 解析主 proto 文件
    const mainResult = parseProtoFile(protoFilePath);
    const allMessages: ProtoMessage[] = [...mainResult.file.messages];

    for (const warning of mainResult.warnings) {
      console.warn(`[mp-proto-codegen] WARNING: ${warning}`);
    }

    // 解析 custom 目录
    if (customProtoDir) {
      const customDirAbs = path.resolve(root, customProtoDir);
      const customFiles = collectProtoFiles(customDirAbs);
      for (const customFile of customFiles) {
        const customResult = parseProtoFile(customFile);
        allMessages.push(...customResult.file.messages);
        for (const warning of customResult.warnings) {
          console.warn(`[mp-proto-codegen] WARNING: ${warning}`);
        }
      }
    }

    // 去重
    const uniqueMessages = allMessages.filter(
      (msg, index, self) => index === self.findIndex((m) => m.name === msg.name)
    );

    console.log(`[mp-proto-codegen] Found ${uniqueMessages.length} messages: ${uniqueMessages.map((m) => m.name).join(', ')}`);

    // 生成所有文件
    const files = generateAllFiles(uniqueMessages);

    // 写入文件
    for (const [fileName, content] of Object.entries(files)) {
      const filePath = path.join(outputDirAbs, fileName);
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`[mp-proto-codegen] Generated ${fileName}`);
    }
  }

  return {
    name: 'mp-proto-codegen',

    /**
     * 构建开始时生成代码
     */
    buildStart() {
      try {
        // protoFile / outputDir 路径相对于 vite.config.ts 所在目录（即 process.cwd()）
        const root = process.cwd();
        generate(root);
      } catch (err) {
        this.error(`[mp-proto-codegen] Failed to generate code: ${(err as Error).message}`);
      }
    },

    /**
     * 开发服务器配置：watch proto 文件变化
     */
    configureServer(server: any) {
      if (!watch) return;

      const root = process.cwd();
      const protoFilePath = path.resolve(root, protoFile);
      const watchPaths = [protoFilePath];

      if (customProtoDir) {
        const customDirAbs = path.resolve(root, customProtoDir);
        if (fs.existsSync(customDirAbs)) {
          watchPaths.push(customDirAbs);
        }
      }

      // 添加 watch
      server.watcher.add(watchPaths);

      server.watcher.on('change', (changedPath: string) => {
        const isProtoFile =
          changedPath === protoFilePath ||
          (customProtoDir && changedPath.startsWith(path.resolve(root, customProtoDir)));

        if (!isProtoFile) return;

        console.log(`[mp-proto-codegen] Proto file changed: ${changedPath}, regenerating...`);

        try {
          generate(root);

          // 通知 Vite 重新加载
          const outputDirAbs = path.resolve(root, outputDir);
          server.ws.send({
            type: 'full-reload',
            path: '*',
          });

          // 触发 HMR 更新
          const generatedFiles = fs.readdirSync(outputDirAbs)
            .filter((f) => f.endsWith('.gen.ts'))
            .map((f) => path.join(outputDirAbs, f));

          for (const file of generatedFiles) {
            const mod = server.moduleGraph.getModuleById(file);
            if (mod) {
              server.moduleGraph.invalidateModule(mod);
            }
          }
        } catch (err) {
          console.error(`[mp-proto-codegen] Error regenerating: ${(err as Error).message}`);
        }
      });
    },
  };
}
