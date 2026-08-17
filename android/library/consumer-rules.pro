# Consumer ProGuard rules for JsBridge library
# Keep all classes in the jsbridge package
-keep class com.github.lzyzsd.jsbridge.** { *; }

# Keep Gson related classes
-keep class com.google.gson.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
