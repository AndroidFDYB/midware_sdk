// AUTO-GENERATED from proto. DO NOT EDIT.

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
export interface UserInfo {
  uid: string;
  ticket: string;
  nickname: string;
  avatar: string;
  level: number;
}

export interface LoanInfo {
  orderId: string;
  amount: number;
  period: number;
  rate: number;
  status: string;
}

export interface VipInfo {
  vipId: string;
  vipLevel: number;
  expireDate: string;
  privileges: string[];
}
