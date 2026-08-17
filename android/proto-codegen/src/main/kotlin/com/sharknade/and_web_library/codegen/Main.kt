package com.sharknade.and_web_library.codegen

import java.io.File

/**
 * Proto Codegen CLI 入口点
 *
 * 供 Gradle JavaExec task 调用，从命令行参数读取 proto 文件路径和输出目录。
 *
 * 用法：
 *   java -cp proto-codegen.jar com.sharknade.and_web_library.codegen.MainKt <protoFile> <outputDir> [customDir]
 */
fun main(args: Array<String>) {
    if (args.size < 2) {
        println("Usage: main <protoFile> <outputDir> [customDir]")
        System.exit(1)
    }

    val protoFilePath = args[0]
    val outputDirPath = args[1]
    val customDirPath = if (args.size >= 3) args[2] else ""

    println("[ProtoCodegen] Parsing: $protoFilePath")

    val outDir = File(outputDirPath)
    outDir.mkdirs()

    // 解析主 proto 文件
    val mainResult = parseProtoFile(protoFilePath)
    val allMessages = mainResult.file.messages.toMutableList()

    for (warning in mainResult.warnings) {
        println("[ProtoCodegen] WARNING: $warning")
    }

    // 解析 custom 目录下的额外 proto 文件
    if (customDirPath.isNotEmpty()) {
        val customFiles = collectProtoFiles(customDirPath)
        for (customFile in customFiles) {
            println("[ProtoCodegen] Parsing custom: $customFile")
            val customResult = parseProtoFile(customFile)
            allMessages.addAll(customResult.file.messages)
            for (warning in customResult.warnings) {
                println("[ProtoCodegen] WARNING: $warning")
            }
        }
    }

    // 去重
    val uniqueMessages = allMessages.distinctBy { it.name }
    println("[ProtoCodegen] Found ${uniqueMessages.size} messages: ${uniqueMessages.map { it.name }}")

    // 合并 ProtoFile
    val mergedProtoFile = ProtoFile(
        syntax = mainResult.file.syntax,
        packageName = mainResult.file.packageName,
        messages = uniqueMessages,
        filePath = protoFilePath
    )

    // 生成所有文件
    val generated = generateAll(mergedProtoFile)

    // 写入 Kotlin 源码
    File(outDir, GeneratedFileNames.ANNOTATIONS).writeText(generated.annotations)
    File(outDir, GeneratedFileNames.CHANNELS).writeText(generated.channels)
    File(outDir, GeneratedFileNames.METHODS).writeText(generated.methods)
    File(outDir, GeneratedFileNames.SETTERS).writeText(generated.setters)

    // 写入 JSON 元数据
    File(outDir, GeneratedFileNames.MAPPINGS).writeText(generated.mappingsJson)

    println("[ProtoCodegen] Generated 5 files in ${outDir.absolutePath}")
}
