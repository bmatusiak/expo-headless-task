package expo.modules.headlesstask

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoHeadlessTaskModule : Module() {
  private val context
    get() = appContext.reactContext ?: appContext.currentActivity
    ?: throw IllegalStateException("Android context is not available yet")

  override fun definition() = ModuleDefinition {
    Name("ExpoHeadlessTask")

    Events("taskRunningChanged", "messageToTask", "messageFromTask")

    OnStartObserving {
      ForegroundHeadlessService.listener = { running ->
        try { sendEvent("taskRunningChanged", mapOf("running" to running)) } catch (_: Exception) {}
      }
      // Emit current state immediately
      try { sendEvent("taskRunningChanged", mapOf("running" to ForegroundHeadlessService.isRunning)) } catch (_: Exception) {}
    }

    OnStopObserving {
      ForegroundHeadlessService.listener = null
    }

    AsyncFunction("startForegroundTask") { taskName: String, data: Map<String, Any>?, notification: Map<String, Any>? ->
      val intent = Intent(context, ForegroundHeadlessService::class.java).apply {
        putExtra("taskName", taskName)
        // Data bundle
        val b = Bundle()
        data?.forEach { (k, v) ->
          when (v) {
            is String -> b.putString(k, v)
            is Int -> b.putInt(k, v)
            is Double -> b.putDouble(k, v)
            is Float -> b.putFloat(k, v)
            is Boolean -> b.putBoolean(k, v)
            is Long -> b.putLong(k, v)
          }
        }
        putExtra("data", b)
        // Notification config
        notification?.let { n ->
          (n["channelId"] as? String)?.let { putExtra("channelId", it) }
          (n["channelName"] as? String)?.let { putExtra("channelName", it) }
          (n["title"] as? String)?.let { putExtra("title", it) }
          (n["text"] as? String)?.let { putExtra("text", it) }
          (n["importance"] as? Int)?.let { putExtra("importance", it) }
        }
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          ContextCompat.startForegroundService(context, intent)
        } else {
          context.startService(intent)
        }
      } catch (_: Exception) {}
    }

    AsyncFunction("stopForegroundTask") {
      val intent = Intent(context, ForegroundHeadlessService::class.java)
      try { context.stopService(intent) } catch (_: Exception) {}
    }

    Function("isTaskRunning") {
      ForegroundHeadlessService.isRunning
    }

    // App JS -> Headless Task JS message
    AsyncFunction("sendToTask") { data: Map<String, Any>? ->
      // Emit to any listeners (both runtimes if active)
      try { sendEvent("messageToTask", mapOf("data" to data)) } catch (_: Exception) {}
    }

    // Headless Task JS -> App JS message
    AsyncFunction("sendFromTask") { data: Map<String, Any>? ->
      try { sendEvent("messageFromTask", mapOf("data" to data)) } catch (_: Exception) {}
    }
  }
}
