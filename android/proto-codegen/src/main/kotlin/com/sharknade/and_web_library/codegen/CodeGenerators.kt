package com.sharknade.and_web_library.codegen

/**
 * 代码生成器
 *
 * 从解析后的 Proto 模型生成各端所需的 Kotlin 源码和元数据文件。
 */

/** 生成产物集合 */
data class GeneratedFiles(
    val annotations: String,
    val channels: String,
    val methods: String,
    val setters: String,
    val mappingsJson: String
)

/** 文件名常量 */
object GeneratedFileNames {
    const val ANNOTATIONS = "MPDataSyncAnnotations.kt"
    const val CHANNELS = "DataSyncChannels.kt"
    const val METHODS = "DataSyncMethods.kt"
    const val SETTERS = "MPDataSyncHelperSetters.kt"
    const val MAPPINGS = "channel-mappings.json"
}

private const val PACKAGE = "com.sharknade.and_web_library"

/**
 * 生成注解定义源码
 *
 * 生成 @NeedsUserInfo, @NeedsLoanInfo, @NeedsVipInfo 等注解类。
 * 每个注解类标记在 Activity/Fragment 上，KSP 编译期扫描。
 */
fun generateAnnotations(messages: List<ProtoMessage>): String = buildString {
    appendLine("// AUTO-GENERATED from proto. DO NOT EDIT.")
    appendLine("package $PACKAGE")
    appendLine()
    appendLine("import kotlin.reflect.KClass")
    appendLine()
    for (msg in messages) {
        val annClass = messageToAnnotationClass(msg.name)
        val comment = msg.comment ?: "标记 Activity/Fragment 需要 ${msg.name} 数据同步"
        appendLine("/**")
        for (line in comment.lines()) appendLine(" * $line")
        appendLine(" *")
        appendLine(" * 通道: ${messageToChannel(msg.name)}")
        appendLine(" * JSBridge 方法: ${messageToSyncMethod(msg.name)}")
        appendLine(" *")
        appendLine(" * 使用方式（组合模式 + KSP 自动注入）：")
        appendLine(" * ```kotlin")
        appendLine(" * @$annClass")
        appendLine(" * class MyActivity : AppCompatActivity() {")
        appendLine(" *     private lateinit var webView: MPBridgeWebView")
        appendLine(" *     private lateinit var dataSyncHelper: MPDataSyncHelper")
        appendLine(" *")
        appendLine(" *     override fun onCreate(savedInstanceState: Bundle?) {")
        appendLine(" *         super.onCreate(savedInstanceState)")
        appendLine(" *         webView = MPBridgeWebView(this)")
        appendLine(" *         val channels = DataSyncBindings.getChannels(this.javaClass.name)")
        appendLine(" *         dataSyncHelper = MPDataSyncHelper.create(webView, channels)")
        appendLine(" *     }")
        appendLine(" * }")
        appendLine(" * ```")
        appendLine(" */")
        appendLine("@Target(AnnotationTarget.CLASS)")
        appendLine("@Retention(AnnotationRetention.RUNTIME)")
        appendLine("annotation class $annClass")
        appendLine()
    }
}

/**
 * 生成通道常量定义源码
 *
 * 生成 object DataSyncChannel { const val USER_INFO = "userInfo" }
 */
fun generateChannels(messages: List<ProtoMessage>): String = buildString {
    appendLine("// AUTO-GENERATED from proto. DO NOT EDIT.")
    appendLine("package $PACKAGE")
    appendLine()
    appendLine("/**")
    appendLine(" * 标准数据通道名称")
    appendLine(" * 由 proto codegen 自动生成")
    appendLine(" */")
    appendLine("object DataSyncChannel {")
    for (msg in messages) {
        val constName = messageToConstantName(msg.name)
        val channelValue = messageToChannel(msg.name)
        appendLine("    const val $constName = \"$channelValue\"")
    }
    appendLine("}")
}

/**
 * 生成方法名映射源码
 *
 * 生成 object DataSyncMethod { fun fromChannel(channel: String): String }
 */
fun generateMethods(messages: List<ProtoMessage>): String = buildString {
    appendLine("// AUTO-GENERATED from proto. DO NOT EDIT.")
    appendLine("package $PACKAGE")
    appendLine()
    appendLine("/**")
    appendLine(" * Native → JS 推送数据时调用的 JSBridge 方法名")
    appendLine(" * 由 proto codegen 自动生成")
    appendLine(" */")
    appendLine("object DataSyncMethod {")
    for (msg in messages) {
        val constName = messageToMethodConstantName(msg.name)
        val methodValue = messageToSyncMethod(msg.name)
        appendLine("    const val $constName = \"$methodValue\"")
    }
    appendLine()
    appendLine("    /** 根据通道名获取对应的 JSBridge 方法名 */")
    appendLine("    fun fromChannel(channel: String): String {")
    appendLine("        return when (channel) {")
    for (msg in messages) {
        val channel = messageToChannel(msg.name)
        val constName = messageToMethodConstantName(msg.name)
        appendLine("            DataSyncChannel.${messageToConstantName(msg.name)} -> $constName")
    }
    appendLine("            else -> \"sync\" + channel.replaceFirstChar { it.uppercase() }")
    appendLine("        }")
    appendLine("    }")
    appendLine("}")
}

/**
 * 生成 Helper setter 扩展函数源码
 *
 * 生成 fun MPDataSyncHelper.setUserInfo(data: String) 等便捷方法。
 * 这些是扩展函数，添加到 MPDataSyncHelper 上，不修改原始类。
 */
fun generateSetters(messages: List<ProtoMessage>): String = buildString {
    appendLine("// AUTO-GENERATED from proto. DO NOT EDIT.")
    appendLine("package $PACKAGE")
    appendLine()
    appendLine("/**")
    appendLine(" * MPDataSyncHelper 的 setter 扩展函数")
    appendLine(" * 由 proto codegen 自动生成")
    appendLine(" */")
    appendLine()
    for (msg in messages) {
        val setterName = messageToSetterName(msg.name)
        val channel = messageToChannel(msg.name)
        val comment = msg.comment ?: "设置 ${msg.name} 数据"
        appendLine("/** $comment */")
        appendLine("fun MPDataSyncHelper.$setterName(data: String) = setData(DataSyncChannel.${messageToConstantName(msg.name)}, data)")
        appendLine()
    }
}

/**
 * 生成 channel-mappings.json 元数据文件
 *
 * 供 KSP 处理器读取，知道哪些注解需要扫描及对应的通道名。
 *
 * JSON 结构：
 * [
 *   { "messageName": "UserInfo", "annotationClass": "NeedsUserInfo", "annotationFqName": "...", "channel": "userInfo", "syncMethod": "syncUserInfo" },
 *   ...
 * ]
 */
fun generateMappingsJson(messages: List<ProtoMessage>): String {
    val entries = messages.map { msg ->
        val annClass = messageToAnnotationClass(msg.name)
        val annFqName = messageToAnnotationFqName(msg.name)
        val channel = messageToChannel(msg.name)
        val syncMethod = messageToSyncMethod(msg.name)
        """  { "messageName": "${msg.name}", "annotationClass": "$annClass", "annotationFqName": "$annFqName", "channel": "$channel", "syncMethod": "$syncMethod" }"""
    }
    return "[\n${entries.joinToString(",\n")}\n]\n"
}

/**
 * 生成所有文件
 */
fun generateAll(protoFile: ProtoFile): GeneratedFiles {
    val messages = protoFile.messages
    return GeneratedFiles(
        annotations = generateAnnotations(messages),
        channels = generateChannels(messages),
        methods = generateMethods(messages),
        setters = generateSetters(messages),
        mappingsJson = generateMappingsJson(messages)
    )
}
