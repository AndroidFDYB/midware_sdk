import org.gradle.api.tasks.JavaExec
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    alias(libs.plugins.android.library)
//    alias(libs.plugins.kotlin.android)  // AGP 9.x 已内置 Kotlin
}

// ========================================
// Proto Codegen Task
// ========================================
// 解析 specs/proto/channels.proto 生成 Kotlin 源码（注解、通道常量、方法映射、setter）
// proto 变化时自动触发增量重新生成
val protoCodegen by tasks.registering(JavaExec::class) {
    group = "codegen"
    description = "Generate Kotlin source from .proto files"

    val protoFile = file("${rootProject.projectDir}/../specs/proto/channels.proto")
    val customDir = file("${rootProject.projectDir}/../specs/proto/custom")
    val outputBase = layout.buildDirectory.dir("generated/proto/kotlin")

    inputs.file(protoFile)
    if (customDir.exists()) {
        inputs.dir(customDir)
    }
    outputs.dir(outputBase)

    val codegenProject = project(":proto-codegen")
    dependsOn(codegenProject.tasks.named("compileKotlin"))
    classpath = codegenProject.sourceSets.getByName("main").runtimeClasspath
    mainClass = "com.sharknade.and_web_library.codegen.MainKt"

    argumentProviders.add(CommandLineArgumentProvider {
        listOf(
            protoFile.absolutePath,
            outputBase.get().asFile.absolutePath,
            customDir.absolutePath
        )
    })
}

// 确保编译前先生成代码
tasks.withType<KotlinCompile>().configureEach {
    dependsOn(protoCodegen)
}
// AGP 9.x Provider 进 SourceSet 时不自动携带任务依赖，需显式添加
tasks.matching {
    it.name.contains("Annotation", ignoreCase = true) ||
    it.name.contains("JavaWithJavac", ignoreCase = true)
}.configureEach {
    dependsOn(protoCodegen)
}

android {
    namespace = "com.sharknade.and_web_library"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        minSdk = 24

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    sourceSets {
        getByName("main") {
            // proto codegen 生成目录（gradle.properties 中已设置 android.sourceset.disallowProvider=false）
            java.srcDir(layout.buildDirectory.dir("generated/proto/kotlin"))
            // AGP 9.x 启用独立 Kotlin SourceSet 后，.kt 文件需额外注册到 kotlin source set
            kotlin.srcDir(layout.buildDirectory.dir("generated/proto/kotlin"))
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    api(project(":library"))
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}