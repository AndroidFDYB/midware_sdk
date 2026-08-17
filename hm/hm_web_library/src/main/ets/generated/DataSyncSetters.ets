// AUTO-GENERATED from proto. DO NOT EDIT.

/**
 * DataSyncHelper 的 setter 方法
 * 由 proto codegen 自动生成
 * 通过混入（mixin）或直接在 DataSyncHelper 中导入使用
 *
 * 使用方式：
 * 在 DataSyncHelper 类中添加以下代码，或通过装饰器/混入模式注入：
 *   // 导入生成的 setter 声明
 *   import { DataSyncSetters } from './generated/DataSyncSetters';
 *   // 应用到 DataSyncHelper 原型上
 */
export class DataSyncSetters {
  /** ============================================
MP-SDK 标准数据同步通道
============================================

本文件是三端（Android / HarmonyOS / Web）数据同步的唯一真相源。
各端 SDK 内置的 codegen 工具链会解析此文件，自动生成：
- Android: @Needs* 注解 + DataSyncChannel 常量 + DataSyncMethod 映射 + Helper setter
- Vue: TypeScript 接口 + @wait*Sync 装饰器 + 通道配置 + Handler 注册
- 鸿蒙: DataSyncChannel 常量 + DataSyncMethod 映射 + Helper setter

命名约定：
Message 名（PascalCase）→ 通道名（camelCase）→ JSBridge 方法名（sync + PascalCase）
UserInfo → userInfo → syncUserInfo

扩展方式：
集成方在 specs/proto/custom/ 目录下新增 .proto 文件，
各端 codegen 会自动解析并生成对应的注解/装饰器/常量。

约束：
- 仅使用 message + 标量字段（string/int32/int64/double/bool）+ repeated
- 不使用嵌套 message / enum / oneof（保持 codegen 解析器简单）
- 字段编号从 1 开始连续递增 */
  setUserInfo(data: string): void {
    this.setData(DataSyncChannel.USER_INFO, data);
  }

  /** 设置 LoanInfo 数据 */
  setLoanInfo(data: string): void {
    this.setData(DataSyncChannel.LOAN_INFO, data);
  }

  /** 设置 VipInfo 数据 */
  setVipInfo(data: string): void {
    this.setData(DataSyncChannel.VIP_INFO, data);
  }
}
