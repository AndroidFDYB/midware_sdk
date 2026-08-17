package com.sharknade.and_web_library.codegen

import java.io.File

/**
 * 轻量级 .proto 文件解析器
 *
 * 仅解析 message 定义和标量字段，不处理嵌套 message / enum / oneof / service。
 * 支持单行注释 (//)。
 */

/** Proto 标量字段类型 */
enum class ProtoScalarType(val kotlinType: String) {
    STRING("String"),
    INT32("Int"),
    INT64("Long"),
    UINT32("Int"),
    UINT64("Long"),
    SINT32("Int"),
    SINT64("Long"),
    FIXED32("Int"),
    FIXED64("Long"),
    SFIXED32("Int"),
    SFIXED64("Long"),
    FLOAT("Float"),
    DOUBLE("Double"),
    BOOL("Boolean"),
    BYTES("ByteArray");

    companion object {
        private val TYPE_MAP: Map<String, ProtoScalarType> = entries.associateBy { it.name.lowercase() }

        fun fromString(type: String): ProtoScalarType? = TYPE_MAP[type.lowercase()]
    }
}

/** Proto 字段定义 */
data class ProtoField(
    val name: String,
    val type: ProtoScalarType,
    val number: Int,
    val repeated: Boolean,
    val comment: String? = null
)

/** Proto Message 定义 */
data class ProtoMessage(
    val name: String,
    val fields: List<ProtoField>,
    val comment: String? = null
)

/** 解析后的 Proto 文件模型 */
data class ProtoFile(
    val syntax: String,
    val packageName: String,
    val messages: List<ProtoMessage>,
    val filePath: String
)

/** 解析结果 */
data class ParseResult(
    val file: ProtoFile,
    val warnings: List<String>
)

/**
 * 解析 .proto 文件内容
 */
fun parseProto(content: String, filePath: String): ParseResult {
    val warnings = mutableListOf<String>()

    // 1. 提取 syntax
    val syntaxRegex = Regex("""syntax\s*=\s*["']([^"']+)["']""")
    val syntaxMatch = syntaxRegex.find(content)
    val syntax = syntaxMatch?.groupValues?.get(1) ?: "proto3"
    if (syntaxMatch == null) {
        warnings.add("No syntax declaration found, defaulting to \"proto3\"")
    }

    // 2. 提取 package
    val packageRegex = Regex("""package\s+([\w.]+)\s*;""")
    val pkg = packageRegex.find(content)?.groupValues?.get(1) ?: ""

    // 3. 提取 message 块
    // 使用非贪婪匹配 + 不支持嵌套大括号（约束要求不使用嵌套 message）
    val messageRegex = Regex("""(?: //[^\n]*\n)*\s*message\s+(\w+)\s*\{([^}]*)\}""")
    val messages = mutableListOf<ProtoMessage>()

    for (match in messageRegex.findAll(content)) {
        val messageName = match.groupValues[1]
        val messageBody = match.groupValues[2]
        val precedingComment = extractPrecedingComment(content, match.range.first)

        val fields = parseFields(messageBody, messageName, filePath, warnings)
        messages.add(ProtoMessage(messageName, fields, precedingComment))
    }

    if (messages.isEmpty()) {
        warnings.add("No messages found in $filePath")
    }

    return ParseResult(
        ProtoFile(syntax, pkg, messages, filePath),
        warnings
    )
}

/**
 * 从文件中读取并解析 .proto 文件
 */
fun parseProtoFile(filePath: String): ParseResult {
    val file = File(filePath)
    val content = file.readText()
    return parseProto(content, file.absolutePath)
}

/**
 * 收集目录下所有 .proto 文件
 */
fun collectProtoFiles(dirPath: String): List<String> {
    val dir = File(dirPath)
    if (!dir.exists() || !dir.isDirectory) return emptyList()

    val results = mutableListOf<String>()
    dir.walkTopDown().forEach { f ->
        if (f.isFile && f.extension == "proto") {
            results.add(f.absolutePath)
        }
    }
    return results
}

/**
 * 提取 message 声明前的注释（向上查找连续的 // 注释行）
 */
private fun extractPrecedingComment(content: String, messageIndex: Int): String? {
    val before = content.substring(0, messageIndex).trimEnd()
    if (before.isEmpty()) return null

    val lines = before.split("\n")
    val commentLines = mutableListOf<String>()

    for (i in lines.indices.reversed()) {
        val line = lines[i].trim()
        val commentMatch = Regex("""^//\s*(.*)$""").find(line)
        if (commentMatch != null) {
            commentLines.add(0, commentMatch.groupValues[1])
        } else if (line.isEmpty()) {
            continue
        } else {
            break
        }
    }

    return if (commentLines.isNotEmpty()) commentLines.joinToString("\n") else null
}

/**
 * 解析 message 体内的字段定义
 */
private fun parseFields(
    messageBody: String,
    messageName: String,
    filePath: String,
    warnings: MutableList<String>
): List<ProtoField> {
    val fields = mutableListOf<ProtoField>()
    val lines = messageBody.split("\n")

    for (line in lines) {
        val trimmed = line.trim()
        if (trimmed.isEmpty() || trimmed.startsWith("//")) continue

        // 提取行内注释
        var fieldPart = trimmed
        var comment: String? = null
        val commentIdx = fieldPart.indexOf("//")
        if (commentIdx >= 0) {
            comment = fieldPart.substring(commentIdx + 2).trim()
            fieldPart = fieldPart.substring(0, commentIdx).trim()
        }

        // 移除末尾分号
        fieldPart = fieldPart.removeSuffix(";").trim()
        if (fieldPart.isEmpty()) continue

        // 解析字段：[repeated] type name = number
        val fieldRegex = Regex("""^(repeated\s+)?(\w+)\s+(\w+)\s*=\s*(\d+)$""")
        val match = fieldRegex.find(fieldPart)

        if (match == null) {
            warnings.add("Skipping unrecognized line in message $messageName ($filePath): \"$trimmed\"")
            continue
        }

        val repeated = match.groupValues[1].isNotEmpty()
        val typeStr = match.groupValues[2]
        val name = match.groupValues[3]
        val number = match.groupValues[4].toInt()

        val scalarType = ProtoScalarType.fromString(typeStr)
        if (scalarType == null) {
            warnings.add(
                "Non-scalar type \"$typeStr\" in message $messageName field $name ($filePath). " +
                "Nested messages and enums are not supported."
            )
            continue
        }

        fields.add(ProtoField(name, scalarType, number, repeated, comment))
    }

    return fields
}
