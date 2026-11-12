package expo.modules.workoutlive

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.Build
import android.provider.Settings
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class WorkoutLiveModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WorkoutLive")
    Function("show") { state: String ->
      WorkoutNotification.post(context(), JSONObject(state))
    }
    Function("update") { state: String ->
      WorkoutNotification.post(context(), JSONObject(state))
    }
    Function("dismiss") { WorkoutNotification.dismiss(context()) }
    Function("promotionStatus") {
      if (Build.VERSION.SDK_INT < 36) "unsupported"
      else if (context().getSystemService(NotificationManager::class.java)
          .canPostPromotedNotifications()) "granted" else "denied"
    }
    Function("openPromotionSettings") {
      if (Build.VERSION.SDK_INT >= 36) {
        context().startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE, context().packageName)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }
  }
  private fun context(): Context = requireNotNull(appContext.reactContext)
}

/** One id replaces the prior session; only JS state changes re-post a swiped notification. */
internal object WorkoutNotification {
  private const val ID = 4821
  private const val CHANNEL = "workout-live"
  private const val PREFS = "workout-live"
  private const val STATE = "state"
  private val handler = Handler(Looper.getMainLooper())
  private var restEnded: Runnable? = null

  private fun manager(context: Context) = context.getSystemService(NotificationManager::class.java)
  private fun preferences(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun dismiss(context: Context) {
    restEnded?.let { handler.removeCallbacks(it) }
    restEnded = null
    manager(context).cancel(ID)
    context.getSystemService(AlarmManager::class.java).cancel(expiry(context))
    preferences(context).edit().remove(STATE).apply()
  }

  private fun expiry(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context, 0, Intent(context, WorkoutActionReceiver::class.java).setAction("expire"),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  fun saved(context: Context): JSONObject? = preferences(context).getString(STATE, null)?.let {
    JSONObject(it)
  }

  fun post(context: Context, state: JSONObject) {
    val manager = manager(context)
    if (!manager.areNotificationsEnabled()) {
      dismiss(context)
      return
    }
    val channel = NotificationChannel(CHANNEL, state.getString("channelName"),
      NotificationManager.IMPORTANCE_LOW).apply {
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
    preferences(context).edit().putString(STATE, state.toString()).apply()
    val rest = state.getString("phase") == "rest"
    val endsAt = state.optLong("restEndsAtMs")
    val running = rest && endsAt > System.currentTimeMillis()
    val expired = rest && !running
    val builder = Notification.Builder(context, CHANNEL)
      .setSmallIcon(context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
        .takeIf { it != 0 } ?: context.applicationInfo.icon)
      // The action leads: collapsed views show only the title and the header line.
      .setContentTitle(if (expired) state.getString("restOver") else state.getString("text"))
      .setContentText(listOf(state.getString("title"), state.getString("next"))
        .filter { it.isNotEmpty() }.joinToString(" · "))
      .setContentIntent(PendingIntent.getActivity(context, 0,
        Intent(Intent.ACTION_VIEW, Uri.parse(state.getString("url")))
          .setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_WORKOUT)
      .setShowWhen(!expired)
      .setUsesChronometer(!expired)
      .setChronometerCountDown(running)
      .setWhen(if (running) endsAt else state.getLong("sessionStartedAtMs"))
    val segments = state.getJSONArray("segments")
    val total = (0 until segments.length()).sumOf { segments.getJSONObject(it).getInt("total") }
    val done = (0 until segments.length()).sumOf { segments.getJSONObject(it).getInt("done") }
    if (Build.VERSION.SDK_INT >= 36 && running) {
      builder.setStyle(Notification.ProgressStyle()
        .setProgressSegments((0 until segments.length()).map {
          Notification.ProgressStyle.Segment(segments.getJSONObject(it).getInt("total").coerceAtLeast(1))
        }).setProgress(done))
      builder.setRequestPromotedOngoing(true)
    } else {
      builder.setProgress(total, done, false)
    }
    fun action(name: String, label: String) {
      val intent = Intent(context, WorkoutActionReceiver::class.java).setAction(name)
        .putExtra(STATE, state.toString())
        .setData(Uri.parse("workout-action://" + state.getString("sessionId") + "/" + name))
      val pending = if (name == "done" && !state.getBoolean("canLog")) {
        // An activity PendingIntent avoids Android's notification-trampoline restriction.
        PendingIntent.getActivity(context, 1,
          Intent(Intent.ACTION_VIEW, Uri.parse(state.getString("url")))
            .setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      } else PendingIntent.getBroadcast(context, name.hashCode(), intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      builder.addAction(Notification.Action.Builder(null, label, pending).build())
    }
    if (running) {
      action("skip", state.getString("skipLabel"))
      action("nudge", state.getString("nudgeLabel"))
    }
    if (state.getBoolean("canComplete")) action("done", state.getString("doneLabel"))
    manager.notify(ID, builder.build())
    val alarms = context.getSystemService(AlarmManager::class.java)
    alarms.cancel(expiry(context))
    restEnded?.let { handler.removeCallbacks(it) }
    restEnded = null
    if (running) {
      // Exact while the runtime is alive; the system alarm also survives process death.
      restEnded = Runnable { saved(context)?.let { post(context, it) } }.also {
        handler.postDelayed(it, (endsAt - System.currentTimeMillis()).coerceAtLeast(1))
      }
      alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, expiry(context))
    }
  }
}

class WorkoutActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == "expire") {
      WorkoutNotification.saved(context)?.let { WorkoutNotification.post(context, it) }
      return
    }
    val payload = intent.getStringExtra("state") ?: return
    // Explicit, immutable PendingIntents are the only entry; stale session actions are checked in JS.
    val service = Intent(context, WorkoutTaskService::class.java)
      .putExtra("state", payload).putExtra("action", intent.action)
    try {
      context.startService(service)
      HeadlessJsTaskService.acquireWakeLockNow(context)
    } catch (_: IllegalStateException) {
      val state = JSONObject(payload)
      state.put("text", state.getString("openToContinue"))
      state.put("restOver", state.getString("openToContinue"))
      WorkoutNotification.post(context, state)
    }
  }
}

class WorkoutTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val state = intent?.getStringExtra("state") ?: return null
    val data = Arguments.createMap().apply {
      putString("state", state)
      putString("action", intent.getStringExtra("action"))
    }
    return HeadlessJsTaskConfig("WorkoutLiveAction", data, 30000, true)
  }
}
