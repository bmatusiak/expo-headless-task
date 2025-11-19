package expo.modules.headlesstask

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.util.Log
import android.os.Build
import android.os.Bundle
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class ForegroundHeadlessService : HeadlessJsTaskService() {
  companion object {
    const val CHANNEL_ID_DEFAULT = "expo_headless_fg"
    const val NOTIFICATION_ID = 1001
    var isRunning: Boolean = false
    var listener: ((Boolean) -> Unit)? = null
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    isRunning = true
    listener?.invoke(true)
    createChannelIfNeeded(intent)
    val notification = buildNotification(intent)
    Log.d("ExpoHeadlessTask", "Starting foreground with notification title=" + intent?.getStringExtra("title"))
    startForeground(NOTIFICATION_ID, notification)
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
    isRunning = false
    listener?.invoke(false)
    // Ensure notification cleaned up if destroyed unexpectedly
    cancelNotification()
    super.onDestroy()
  }

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

    val notification = builder.build()
    // Ensure notification cannot be dismissed while service runs
    notification.flags = notification.flags or Notification.FLAG_NO_CLEAR or Notification.FLAG_ONGOING_EVENT
    return notification
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val taskName = intent?.getStringExtra("taskName") ?: return null
    val bundle = intent?.getBundleExtra("data") ?: Bundle()
    return HeadlessJsTaskConfig(taskName, Arguments.fromBundle(bundle), 0, true)
  }

  private fun cancelNotification() {
    try {
      val nm = getSystemService(NotificationManager::class.java)
      nm.cancel(NOTIFICATION_ID)
    } catch (_: Exception) {}
  }
}
