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
    var isTask: Boolean = false
    var listener: ((Boolean) -> Unit)? = null
  }

  // Broadcast receiver logic migrated to ExpoHeadlessTaskModule. Keep no local receiver.

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    Log.d("ExpoHeadlessTask", "ForegroundHeadlessService onStartCommand: intent=$intent, flags=$flags, startId=$startId")
    isTask = true // Marking this instace as the running task
    // If we're here due to a re-notify request (user dismissed the notification),
    // rebuild the notification without re-scheduling the JS task.
    if (intent?.action == ACTION_RENOTIFY || intent?.getBooleanExtra("renotify", false) == true) {
      listener?.invoke(true)
      createChannelIfNeeded(intent)
      val notification = buildNotification(intent)
      Log.d("ExpoHeadlessTask", "Re-notifying foreground with title=" + intent.getStringExtra("title"))
      startForeground(NOTIFICATION_ID, notification)
      return START_STICKY
    }

    listener?.invoke(true)
    createChannelIfNeeded(intent)
    val notification = buildNotification(intent)
    Log.d("ExpoHeadlessTask", "Starting foreground with notification title=" + intent?.getStringExtra("title"))
    startForeground(NOTIFICATION_ID, notification)
    // Receiver moved to ExpoHeadlessTaskModule; no local registration needed.
    // IMPORTANT: Call super so HeadlessJsTaskService schedules the JS task.
    // Returning its result preserves expected lifecycle behavior.
    val result = try {
      super.onStartCommand(intent, flags, startId)
    } catch (e: Exception) {
      Log.e("ExpoHeadlessTask", "super.onStartCommand failed: ${e.message}")
      START_STICKY
    }
    return result
  }

  override fun onHeadlessJsTaskStart(taskId: Int) {
    Log.d("ExpoHeadlessTask", "onHeadlessJsTaskStart: taskId=$taskId")
    try { super.onHeadlessJsTaskStart(taskId) } catch (_: Exception) {}
  }

  override fun onHeadlessJsTaskFinish(taskId: Int) {
    // Stop foreground + service so notification is dismissed when task completes
    try {
      stopForeground(true)
    } catch (_: Exception) {}
    // Explicitly cancel notification in case some OEMs keep it
    cancelNotification()
    Log.d("ExpoHeadlessTask", "onHeadlessJsTaskFinish: taskId=$taskId; foreground stopped & notification cancelled")
    try {
      stopSelf()
    } catch (_: Exception) {}
    try { super.onHeadlessJsTaskFinish(taskId) } catch (_: Exception) {}
  }

  override fun onDestroy() {
    Log.d("ExpoHeadlessTask", "ForegroundHeadlessService onDestroy")
    listener?.invoke(false)
    cancelNotification()
    super.onDestroy()
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
    val builder = NotificationCompat.Builder(this, channelId)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setAutoCancel(false)
      .setOngoing(true)

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

    // If the user dismisses the notification, immediately re-add it.
    try {
      val reNotifyIntent = Intent(this, ForegroundHeadlessService::class.java).apply {
        action = ACTION_RENOTIFY
        // Propagate essentials so the rebuilt notification has consistent content
        putExtra("channelId", channelId)
        putExtra("channelName", intent?.getStringExtra("channelName"))
        val importanceRaw = intent?.getIntExtra("importance", NotificationManager.IMPORTANCE_LOW)
          ?: NotificationManager.IMPORTANCE_LOW
        putExtra("importance", importanceRaw)
        putExtra("title", title)
        putExtra("text", text)
        // Marker for older callers that might not set action
        putExtra("renotify", true)
      }
      val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
      val deletePI = PendingIntent.getService(this, 1, reNotifyIntent, piFlags)
      builder.setDeleteIntent(deletePI)
    } catch (_: Exception) { }

    val notification = builder.build()
    // Ensure notification cannot be dismissed while service runs
    notification.flags = notification.flags or Notification.FLAG_NO_CLEAR or Notification.FLAG_ONGOING_EVENT
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