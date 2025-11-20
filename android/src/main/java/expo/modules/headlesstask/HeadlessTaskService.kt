package expo.modules.headlesstask

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

open class HeadlessTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val taskData: WritableMap = Arguments.createMap()
    intent?.extras?.let { extras ->
      for (key in extras.keySet()) {
        val value = extras.get(key)
        when (value) {
          is String -> taskData.putString(key, value)
          is Int -> taskData.putInt(key, value)
          is Boolean -> taskData.putBoolean(key, value)
          is Double -> taskData.putDouble(key, value)
          is Float -> taskData.putDouble(key, value.toDouble())
        }
      }
    }
    // Provide a default value so JS can distinguish invocation
    if (!taskData.hasKey("_started")) taskData.putBoolean("_started", true)
    val taskName = intent?.getStringExtra("taskName") ?: "HEADLESS_TASK"
    return HeadlessJsTaskConfig(
      taskName, // JS task name; must register in JS side
      taskData,
      0, // timeout ms
      true // allowed in foreground
    )
  }
}
