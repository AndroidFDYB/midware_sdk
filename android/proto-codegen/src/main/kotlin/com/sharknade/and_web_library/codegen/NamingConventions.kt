package com.sharknade.and_web_library.codegen

/**
 * 命名约定工具
 *
 * 从 Proto Message 名推导各端所需的标识符名称。
 * 命名约定是单向推导，改 Message 名即改变所有下游标识符。
 */

/** PascalCase → camelCase（首字母小写） */
fun toCamelCase(pascalCase: String): String {
    if (pascalCase.isEmpty()) return ""
    return pascalCase.first().lowercaseChar() + pascalCase.drop(1)
}

/** PascalCase → UPPER_SNAKE_CASE */
fun toUpperSnakeCase(pascalCase: String): String {
    if (pascalCase.isEmpty()) return ""
    val withSeparators = pascalCase.mapIndexed { index, c ->
        if (index > 0 && c.isUpperCase()) "_$c" else c.toString()
    }.joinToString("")
    return withSeparators.uppercase()
}

/** Message 名 → 通道名 (UserInfo → userInfo) */
fun messageToChannel(messageName: String): String = toCamelCase(messageName)

/** Message 名 → JSBridge 方法名 (UserInfo → syncUserInfo) */
fun messageToSyncMethod(messageName: String): String = "sync$messageName"

/** Message 名 → Android 注解类名 (UserInfo → NeedsUserInfo) */
fun messageToAnnotationClass(messageName: String): String = "Needs$messageName"

/** Message 名 → Android 注解全限定名 */
fun messageToAnnotationFqName(messageName: String, basePackage: String = "com.sharknade.and_web_library"): String =
    "$basePackage.${messageToAnnotationClass(messageName)}"

/** Message 名 → Vue 装饰器名 (UserInfo → waitUserInfoSync) */
fun messageToDecoratorName(messageName: String): String = "wait${messageName}Sync"

/** Message 名 → Helper setter 方法名 (UserInfo → setUserInfo) */
fun messageToSetterName(messageName: String): String = "set$messageName"

/** Message 名 → 鸿蒙通道常量名 (UserInfo → USER_INFO) */
fun messageToConstantName(messageName: String): String = toUpperSnakeCase(messageName)

/** Message 名 → 鸿蒙方法常量名 (UserInfo → SYNC_USER_INFO) */
fun messageToMethodConstantName(messageName: String): String = "SYNC_${toUpperSnakeCase(messageName)}"
