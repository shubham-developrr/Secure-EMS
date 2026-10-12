# Keep Capacitor & Secure EMS Kiosk Native Bridge classes for release builds
-keep class com.secureems.student.kiosk.** { *; }
-keep class com.getcapacitor.** { *; }

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
