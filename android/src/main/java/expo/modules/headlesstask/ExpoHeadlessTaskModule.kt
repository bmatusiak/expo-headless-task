package expo.modules.headlesstask

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class ExpoHeadlessTaskModule : Module() {
  private val context
    get() = appContext.reactContext ?: appContext.currentActivity
    ?: throw IllegalStateException("Android context is not available yet")

  private val ACTION_IPC = "expo.modules.headlesstask.IPC"
  private var ipcReceiverRegistered = false
  private val ipcReceiver = object : BroadcastReceiver() {
    override fun onReceive(ctx: Context?, intent: Intent?) {
      if (intent?.action != ACTION_IPC) return
      try {
        val originIsTask = intent.getBooleanExtra("originIsTask", false)
        val currentIsTask = ForegroundHeadlessService.isTask
        // Ignore events originating from the same context (prevent echo)
        if (originIsTask == currentIsTask) return
        val eventName = intent.getStringExtra("eventName") ?: return
        val json = intent.getStringExtra("json") ?: "{}"
        sendEvent("ipcEvent", mapOf(
          "event" to eventName,
          "json" to json,
          "originIsTask" to originIsTask
        ))
      } catch (_: Exception) {}
    }
  }

  @SuppressLint("UnspecifiedRegisterReceiverFlag")
  private fun ensureIpcReceiver() {
    if (ipcReceiverRegistered) return
    try {
      val filter = IntentFilter(ACTION_IPC)
      if (Build.VERSION.SDK_INT >= 33) {
        context.registerReceiver(ipcReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(ipcReceiver, filter)
      }
      ipcReceiverRegistered = true
    } catch (_: Exception) {}
  }

  private fun mapToJson(data: Map<String, Any>?): String {
    if (data == null || data.isEmpty()) return "{}"
    val sb = StringBuilder()
    sb.append('{')
    var first = true
    for ((k, v) in data) {
      if (!first) sb.append(',') else first = false
      sb.append('"').append(escapeJson(k)).append('"').append(':')
      when (v) {
        is String -> sb.append('"').append(escapeJson(v)).append('"')
        is Number, is Boolean -> sb.append(v.toString())
        else -> sb.append('"').append(escapeJson(v.toString())).append('"')
      }
    }
    sb.append('}')
    return sb.toString()
  }

  private fun escapeJson(s: String): String = s
    .replace("\\", "\\\\")
    .replace("\"", "\\\"")
    .replace("\n", "\\n")
    .replace("\r", "\\r")
    .replace("\t", "\\t")

  @SuppressLint("UnspecifiedRegisterReceiverFlag")
  override fun definition() = ModuleDefinition {
    Name("ExpoHeadlessTask")

     // Native -> JS event for IPC delivery
     Events("ipcEvent")

    AsyncFunction("startForegroundTask") { taskName: String, data: Map<String, Any>?, notification: Map<String, Any>? ->
      ensureIpcReceiver()
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
          (n["sticky"] as? Boolean)?.let { putExtra("sticky", it) }
        }
      }
      try {
        ContextCompat.startForegroundService(context, intent)
      } catch (_: Exception) {}
    }

    AsyncFunction("stopForegroundTask") {
      ensureIpcReceiver()
      val intent = Intent(context, ForegroundHeadlessService::class.java)
      try { context.stopService(intent) } catch (_: Exception) {}
    }

    Function("isTask") {
      ensureIpcReceiver()
      ForegroundHeadlessService.isTask
    }

    // IPC emit: broadcasts an intent only other process will consume.
    AsyncFunction("emit") { eventName: String, data: Map<String, Any>? ->
      ensureIpcReceiver()
      try {
        val intent = Intent(ACTION_IPC).apply {
          setPackage(context.packageName) // restrict to our app package
          putExtra("eventName", eventName)
          putExtra("json", mapToJson(data))
          putExtra("originIsTask", ForegroundHeadlessService.isTask)
        }
        context.sendBroadcast(intent)
      } catch (_: Exception) {}
    }

    // Check whether the ForegroundHeadlessService is running by asking it to reply.
    // Optional parameter: timeoutMs (Int) - how long to wait for a reply in milliseconds.
    AsyncFunction("checkTask") { timeoutMs: Int? ->
      ensureIpcReceiver()
      val latch = CountDownLatch(1)
      val ok = AtomicBoolean(false)
      val tmpReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
          try {
            if (intent?.action != ACTION_IPC) return
            val eventName = intent.getStringExtra("eventName") ?: return
            val originIsTask = intent.getBooleanExtra("originIsTask", false)
            if (eventName == "CHECK_TASK_OK" && originIsTask) {
              ok.set(true)
              latch.countDown()
            }
          } catch (_: Exception) {}
        }
      }
      try {
        val filter = IntentFilter(ACTION_IPC)
        if (Build.VERSION.SDK_INT >= 33) {
          context.registerReceiver(tmpReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
          context.registerReceiver(tmpReceiver, filter)
        }
      } catch (_: Exception) { }

      try {
        val intent = Intent(ACTION_IPC).apply {
          setPackage(context.packageName)
          putExtra("eventName", "CHECK_TASK")
          putExtra("json", "{}")
          putExtra("originIsTask", ForegroundHeadlessService.isTask)
        }
        context.sendBroadcast(intent)
      } catch (_: Exception) {}

      try {
        val waitMs = (timeoutMs?.toLong() ?: 1000L)
        latch.await(waitMs, TimeUnit.MILLISECONDS)
      } catch (_: Exception) {}

      try { context.unregisterReceiver(tmpReceiver) } catch (_: Exception) {}
      ok.get()
    }

  }
}