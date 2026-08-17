package com.sharknade.and_web_library.processor

import com.google.devtools.ksp.processing.SymbolProcessor
import com.google.devtools.ksp.processing.SymbolProcessorEnvironment
import com.google.devtools.ksp.processing.SymbolProcessorProvider

/**
 * KSP 处理器 Provider
 *
 * 通过 SPI 机制注册，KSP 在编译期自动发现并实例化此类。
 * 为每个编译单元创建一个 DataSyncSymbolProcessor 实例。
 */
class DataSyncSymbolProcessorProvider : SymbolProcessorProvider {
    override fun create(environment: SymbolProcessorEnvironment): SymbolProcessor {
        return DataSyncSymbolProcessor(
            codeGenerator = environment.codeGenerator,
            logger = environment.logger,
            options = environment.options
        )
    }
}
