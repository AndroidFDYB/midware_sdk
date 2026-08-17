package com.sharknade.and_web_library.processor

import com.google.devtools.ksp.processing.CodeGenerator
import com.google.devtools.ksp.processing.Dependencies
import com.google.devtools.ksp.processing.KSPLogger
import com.google.devtools.ksp.processing.Resolver
import com.google.devtools.ksp.processing.SymbolProcessor
import com.google.devtools.ksp.symbol.KSAnnotated
import com.google.devtools.ksp.symbol.KSClassDeclaration
import java.io.File

/**
 * KSP 数据同步注解处理器（通用化版本）
 *
 * 从 channel-mappings.json 动态读取注解→通道映射，
 * 不再硬编码 @NeedsUserInfo / @NeedsLoanInfo 等常量。
 *
 * 处理两类注解：
 * 1. Proto 生成的 @Needs* 注解（通过 channel-mappings.json 发现）
 * 2. @NeedsDataSync(channel) 通用注解（从参数提取通道名）
 *
 * 生成 DataSyncBindings 注册表对象，运行时通过类名直接查表获取所需数据通道。
 *
 * 生成代码示例：
 * ```kotlin
 * object DataSyncBindings {
 *     fun getChannels(className: String): Set<String> = when (className) {
 *         "com.example.LoanActivity" -> setOf("userInfo", "loanInfo")
 *         else -> emptySet()
 *     }
 * }
 * ```
 */
class DataSyncSymbolProcessor(
    private val codeGenerator: CodeGenerator,
    private val logger: KSPLogger,
    private val options: Map<String, String>
) : SymbolProcessor {

    companion object {
        private const val OPTION_MAPPINGS_PATH = "channel_mappings_path"
        private const val ANNOT_NEEDS_DATA_SYNC = "com.sharknade.and_web_library.NeedsDataSync"

        private const val GENERATED_PACKAGE = "com.sharknade.and_web_library.generated"
        private const val GENERATED_FILE_NAME = "DataSyncBindings"
    }

    /** 防止多次处理 */
    private var processed = false

    /** 从 channel-mappings.json 读取的注解 FQ 名 → 通道名映射 */
    private var standardMappings: Map<String, String> = emptyMap()

    override fun process(resolver: Resolver): List<KSAnnotated> {
        if (processed) return emptyList()
        processed = true

        // 读取 channel-mappings.json
        loadChannelMappings()

        if (standardMappings.isEmpty()) {
            logger.warn("DataSyncSymbolProcessor: No channel mappings found. " +
                "Ensure proto codegen task has run and channel-mappings.json is accessible. " +
            "Option: $OPTION_MAPPINGS_PATH")
        }

        // className → 通道集合
        val bindings = mutableMapOf<String, MutableSet<String>>()
        val deferred = mutableListOf<KSAnnotated>()

        // 标准注解（来自 proto codegen）→ 固定通道
        for ((annotationFqName, channel) in standardMappings) {
            resolver.getSymbolsWithAnnotation(annotationFqName).forEach { symbol ->
                if (symbol is KSClassDeclaration) {
                    val className = symbol.qualifiedName?.asString()
                    if (className != null) {
                        bindings.getOrPut(className) { mutableSetOf() }.add(channel)
                    }
                } else {
                    deferred.add(symbol)
                }
            }
        }

        // @NeedsDataSync(channel = "xxx") → 动态通道
        resolver.getSymbolsWithAnnotation(ANNOT_NEEDS_DATA_SYNC).forEach { symbol ->
            if (symbol is KSClassDeclaration) {
                val className = symbol.qualifiedName?.asString()
                if (className != null) {
                    val channel = extractChannelArg(symbol)
                    if (channel != null) {
                        bindings.getOrPut(className) { mutableSetOf() }.add(channel)
                    } else {
                        logger.warn("@NeedsDataSync on $className has no channel argument")
                    }
                }
            } else {
                deferred.add(symbol)
            }
        }

        if (bindings.isNotEmpty()) {
            generateBindingsFile(bindings)
            logger.info("DataSyncSymbolProcessor: generated ${bindings.size} bindings, " +
                "mappings: $standardMappings")
        }

        return deferred
    }

    /**
     * 从 channel-mappings.json 读取注解→通道映射
     *
     * JSON 格式：
     * [
     *   { "messageName": "UserInfo", "annotationClass": "NeedsUserInfo",
     *     "annotationFqName": "com.sharknade.and_web_library.NeedsUserInfo",
     *     "channel": "userInfo", "syncMethod": "syncUserInfo" },
     *   ...
     * ]
     */
    private fun loadChannelMappings() {
        val mappingsPath = options[OPTION_MAPPINGS_PATH]
        if (mappingsPath == null) {
            logger.warn("DataSyncSymbolProcessor: option '$OPTION_MAPPINGS_PATH' not set")
            return
        }

        val file = File(mappingsPath)
        if (!file.exists()) {
            logger.warn("DataSyncSymbolProcessor: channel-mappings.json not found at $mappingsPath")
            return
        }

        val content = file.readText()
        // 轻量级正则解析：提取 annotationFqName 和 channel
        val pattern = Regex(""""annotationFqName":\s*"([^"]+)".*?"channel":\s*"([^"]+)"""")
        val mappings = mutableMapOf<String, String>()

        for (match in pattern.findAll(content)) {
            val fqName = match.groupValues[1]
            val channel = match.groupValues[2]
            mappings[fqName] = channel
        }

        standardMappings = mappings
        logger.info("DataSyncSymbolProcessor: loaded ${mappings.size} channel mappings from $mappingsPath")
    }

    /**
     * 从类的注解列表中提取 @NeedsDataSync 的 channel 参数值
     */
    private fun extractChannelArg(classDecl: KSClassDeclaration): String? {
        for (annotation in classDecl.annotations) {
            val typeFqName = try {
                annotation.annotationType.resolve()
                    .declaration.qualifiedName?.asString()
            } catch (e: Exception) {
                null
            }
            if (typeFqName == ANNOT_NEEDS_DATA_SYNC) {
                for (arg in annotation.arguments) {
                    if (arg.name?.asString() == "channel") {
                        return arg.value as? String
                    }
                }
            }
        }
        return null
    }

    /**
     * 生成 DataSyncBindings.kt 源文件
     */
    private fun generateBindingsFile(bindings: Map<String, Set<String>>) {
        val code = buildString {
            appendLine("package $GENERATED_PACKAGE")
            appendLine()
            appendLine("/**")
            appendLine(" * KSP 自动生成的数据同步绑定注册表")
            appendLine(" * 编译期扫描 @Needs* 注解和 @NeedsDataSync 注解")
            appendLine(" * 运行时通过类名查询所需数据通道，无需反射")
            appendLine(" */")
            appendLine("object $GENERATED_FILE_NAME {")
            appendLine("    fun getChannels(className: String): Set<String> = when (className) {")
            for ((className, channels) in bindings) {
                val channelsStr = channels.sorted().joinToString(", ") { "\"$it\"" }
                appendLine("        \"$className\" -> setOf($channelsStr)")
            }
            appendLine("        else -> emptySet()")
            appendLine("    }")
            appendLine("}")
        }

        val file = codeGenerator.createNewFile(
            dependencies = Dependencies(false),
            packageName = GENERATED_PACKAGE,
            fileName = GENERATED_FILE_NAME
        )
        file.use { stream ->
            stream.write(code.toByteArray())
        }
    }
}
