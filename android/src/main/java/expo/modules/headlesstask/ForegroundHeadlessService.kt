package expo.modules.headlesstask

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.util.Log
import android.os.Build
import android.os.Bundle
import android.content.Intent
import android.content.IntentFilter
import android.content.Context
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication

/**
  * Foreground variant of the headless task service.
  * Inherits from [HeadlessTaskService] so the same JS task execution
  * path is used while adding a persistent foreground notification.

  * Remember to declare this service in AndroidManifest.xml:*
  Process starts with its own name to have a separate process to have a isolate js context the foreground service.
  <service
    android:name="expo.modules.headlesstask.ForegroundHeadlessService"
    android:process=":expo_headless_service_fg"
    android:exported="false"
    android:foregroundServiceType="dataSync" />
 */
class ForegroundHeadlessService : HeadlessTaskService() {
  companion object {
    const val CHANNEL_ID_DEFAULT = "expo_headless_fg"
    const val NOTIFICATION_ID = 1001
    const val ACTION_RENOTIFY = "expo_headless_fg_RENOTIFY"
    const val ACTION_STOP = "expo_headless_fg_STOP"
    const val ACTION_IPC = "expo.modules.headlesstask.IPC"
    var isTask: Boolean = false
    // var listener: ((Boolean) -> Unit)? = null
  }

  // Broadcast receiver logic migrated to ExpoHeadlessTaskModule. Keep no local receiver.
  private var ipcReceiverRegistered = false
  private val ipcReceiver = object : android.content.BroadcastReceiver() {
    override fun onReceive(ctx: Context?, intent: Intent?) {
      try {
        if (intent?.action != ACTION_IPC) return
        val eventName = intent.getStringExtra("eventName") ?: return
        // If someone asks CHECK_TASK, reply with CHECK_TASK_OK so other side knows we're alive
        if (eventName == "CHECK_TASK") {
          val reply = Intent(ACTION_IPC).apply {
            setPackage(packageName)
            putExtra("eventName", "CHECK_TASK_OK")
            putExtra("json", "true")
            putExtra("originIsTask", true)
          }
          try { sendBroadcast(reply) } catch (_: Exception) {}
        }
      } catch (_: Exception) {}
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Log.d("ExpoHeadlessTask", "ForegroundHeadlessService onStartCommand: intent=$intent, flags=$flags, startId=$startId")
    isTask = true // Marking this instace as the running task
    // Ensure local IPC receiver is registered so we can respond to CHECK_TASK
    try {
      if (!ipcReceiverRegistered) {
        val filter = IntentFilter(ACTION_IPC)
        if (Build.VERSION.SDK_INT >= 33) {
          registerReceiver(ipcReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
          registerReceiver(ipcReceiver, filter)
        }
        ipcReceiverRegistered = true
      }
    } catch (_: Exception) {}
    // If explicit stop requested (e.g. user dismissed non-sticky notification)
    if (intent?.action == ACTION_STOP) {
      // Broadcast STOP_TASK over IPC before shutting down
      try {
        val ipcIntent = Intent(ACTION_IPC).apply {
          setPackage(packageName)
          putExtra("eventName", "STOP_TASK")
          putExtra("json", "true")
          putExtra("originIsTask", false)
        }
        sendBroadcast(ipcIntent)
      } catch (_: Exception) { }
      // try { stopForeground(true) } catch (_: Exception) {}
      // cancelNotification()
      // listener?.invoke(false)
      // try { stopSelf() } catch (_: Exception) {}
      return START_NOT_STICKY
    }
    // If we're here due to a re-notify request (user dismissed the notification),
    // rebuild the notification without re-scheduling the JS task.
    if (intent?.action == ACTION_RENOTIFY || intent?.getBooleanExtra("renotify", false) == true) {
      // listener?.invoke(true)
      createChannelIfNeeded(intent)
      val notification = buildNotification(intent)
      // Log.d("ExpoHeadlessTask", "Re-notifying foreground with title=" + intent.getStringExtra("title"))
      startForeground(NOTIFICATION_ID, notification)
      return START_STICKY
    }

    // listener?.invoke(true)
    createChannelIfNeeded(intent)
    val notification = buildNotification(intent)
    // Log.d("ExpoHeadlessTask", "Starting foreground with notification title=" + intent?.getStringExtra("title"))
    startForeground(NOTIFICATION_ID, notification)
    // Receiver moved to ExpoHeadlessTaskModule; no local registration needed.
    // IMPORTANT: Call super so HeadlessJsTaskService schedules the JS task.
    // Returning its result preserves expected lifecycle behavior.
    val result = try {
      super.onStartCommand(intent, flags, startId)
    } catch (e: Exception) {
      // Log.e("ExpoHeadlessTask", "super.onStartCommand failed: ${e.message}")
      START_STICKY
    }
    return result
  }

  override fun onHeadlessJsTaskStart(taskId: Int) {
    // Log.d("ExpoHeadlessTask", "onHeadlessJsTaskStart: taskId=$taskId")
    try { super.onHeadlessJsTaskStart(taskId) } catch (_: Exception) {}
  }

  override fun onHeadlessJsTaskFinish(taskId: Int) {
    // Stop foreground + service so notification is dismissed when task completes
    try {
      stopForeground(true)
    } catch (_: Exception) {}
    // Explicitly cancel notification in case some OEMs keep it
    cancelNotification()
    Log.d("ExpoHeadlessTask", "onHeadlessJsTaskFinish: taskId=$taskId; foreground stopped")
    try { stopSelf() } catch (_: Exception) {}
    try { super.onHeadlessJsTaskFinish(taskId) } catch (_: Exception) {}
  }

  override fun onDestroy() {
    // Log.d("ExpoHeadlessTask", "ForegroundHeadlessService STOPPED")
    // listener?.invoke(false)
    // cancelNotification()
    try {
      if (ipcReceiverRegistered) {
        unregisterReceiver(ipcReceiver)
        ipcReceiverRegistered = false
      }
    } catch (_: Exception) {}
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    Log.d("ExpoHeadlessTask", "ForegroundHeadlessService onTaskRemoved")
    try { super.onTaskRemoved(rootIntent) } catch (_: Exception) {}
  } 

  // No IPC messenger: messaging stripped from module.

  private fun createChannelIfNeeded(intent: Intent?) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channelId = intent?.getStringExtra("channelId") ?: CHANNEL_ID_DEFAULT
      val channelName = intent?.getStringExtra("channelName") ?: "Foreground Task"
      val importanceRaw = intent?.getIntExtra("importance", NotificationManager.IMPORTANCE_LOW)
        ?: NotificationManager.IMPORTANCE_LOW
      val nm = getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(channelId) == null) {
        nm.createNotificationChannel(NotificationChannel(channelId, channelName, importanceRaw))
      }
    }
  }

  private fun buildNotification(intent: Intent?): Notification {
    val channelId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      intent?.getStringExtra("channelId") ?: CHANNEL_ID_DEFAULT
    } else {
      ""
    }
    val title = intent?.getStringExtra("title") ?: "Running background task"
    val text = intent?.getStringExtra("text") ?: "Processing..."
    val sticky = intent?.getBooleanExtra("sticky", true) ?: true
    val builder = NotificationCompat.Builder(this, channelId)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setAutoCancel(false)
      .setOngoing(sticky)

    // When the notification is tapped, bring the app to the foreground
    try {
      val pm = applicationContext.packageManager
      val launchIntent = pm.getLaunchIntentForPackage(applicationContext.packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      if (launchIntent != null) {
        val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
          PendingIntent.FLAG_UPDATE_CURRENT
        }
        val contentIntent = PendingIntent.getActivity(this, 0, launchIntent, piFlags)
        builder.setContentIntent(contentIntent)
      }
    } catch (_: Exception) { }

    // If sticky, re-notify on dismiss; else stop service.
    try {
      val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
      if (sticky) {
        val reNotifyIntent = Intent(this, ForegroundHeadlessService::class.java).apply {
          action = ACTION_RENOTIFY
          putExtra("channelId", channelId)
          putExtra("channelName", intent?.getStringExtra("channelName"))
          val importanceRaw = intent?.getIntExtra("importance", NotificationManager.IMPORTANCE_LOW)
            ?: NotificationManager.IMPORTANCE_LOW
          putExtra("importance", importanceRaw)
          putExtra("title", title)
          putExtra("text", text)
          putExtra("renotify", true)
          putExtra("sticky", true)
        }
        val deletePI = PendingIntent.getService(this, 1, reNotifyIntent, piFlags)
        builder.setDeleteIntent(deletePI)
      } else {
        val stopIntent = Intent(this, ForegroundHeadlessService::class.java).apply {
          action = ACTION_STOP
        }
        val deletePI = PendingIntent.getService(this, 2, stopIntent, piFlags)
        builder.setDeleteIntent(deletePI)
      }
    } catch (_: Exception) { }

    val notification = builder.build()
    // If sticky, ensure notification cannot be dismissed; else allow dismissal.
    if (sticky) {
      notification.flags = notification.flags or Notification.FLAG_NO_CLEAR or Notification.FLAG_ONGOING_EVENT
    }
    return notification
  }

  private fun cancelNotification() {
    try {
      val nm = getSystemService(NotificationManager::class.java)
      nm.cancel(NOTIFICATION_ID)
    } catch (_: Exception) {}
  }

  // ensureBroadcastReceiver removed; handled centrally in module.
}