package expo.modules.nextworkoutwidget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/** Draws the snapshot with RemoteViews: no Compose or Glance dependency, and every tap is a link. */
class NextWorkoutWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    redraw(context, manager, ids)
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == WEEK_EXPIRED) refreshAll(context)
    else super.onReceive(context, intent)
  }

  override fun onDisabled(context: Context) {
    scheduleExpiry(context, 0L)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context, manager: AppWidgetManager, id: Int, options: Bundle,
  ) {
    redraw(context, manager, intArrayOf(id))
  }

  companion object {
    private const val WEEK_EXPIRED = "expo.modules.nextworkoutwidget.WEEK_EXPIRED"

    private val DOTS = intArrayOf(
      R.id.dot1, R.id.dot2, R.id.dot3, R.id.dot4, R.id.dot5, R.id.dot6, R.id.dot7,
    )

    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, NextWorkoutWidgetProvider::class.java))
      redraw(context, manager, ids)
    }

    private fun redraw(context: Context, manager: AppWidgetManager, ids: IntArray) {
      if (ids.isEmpty()) return
      val snapshot = WidgetSnapshotStore.read(context)
      val now = System.currentTimeMillis()
      val week = snapshot?.optJSONObject("week")?.takeIf { it.optLong("expiresAt") > now }
      ids.forEach { update(context, manager, it, snapshot, week) }
      scheduleExpiry(context, week?.optLong("expiresAt") ?: 0L)
    }

    private fun scheduleExpiry(context: Context, expiresAt: Long) {
      val alarms = context.getSystemService(AlarmManager::class.java) ?: return
      val intent = Intent(context, NextWorkoutWidgetProvider::class.java).setAction(WEEK_EXPIRED)
      val refresh = PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_IMMUTABLE)
      if (expiresAt > 0L) {
        alarms.setAndAllowWhileIdle(AlarmManager.RTC, expiresAt, refresh)
      } else {
        alarms.cancel(refresh)
      }
    }

    private fun color(value: String?, fallback: Int): Int = try {
      Color.parseColor(value)
    } catch (_: Exception) {
      fallback
    }

    private fun open(context: Context, url: String?): PendingIntent {
      val intent = if (url != null) {
        Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(context.packageName)
      } else {
        context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      return PendingIntent.getActivity(
        context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun update(
      context: Context,
      manager: AppWidgetManager,
      id: Int,
      snapshot: JSONObject?,
      week: JSONObject?,
    ) {
      val views = RemoteViews(context.packageName, R.layout.next_workout_widget)
      val colors = snapshot?.optJSONObject("colors")
      val surface = color(colors?.optString("surface"), Color.parseColor("#1C1C1E"))
      val ink = color(colors?.optString("ink"), Color.WHITE)
      val muted = color(colors?.optString("muted"), Color.GRAY)
      val accent = color(colors?.optString("accent"), Color.parseColor("#8E7CFF"))
      val onAccent = color(colors?.optString("onAccent"), Color.BLACK)
      views.setInt(R.id.widget_background, "setColorFilter", surface)
      views.setInt(R.id.widget_button_background, "setColorFilter", accent)

      // Until the app has written a snapshot the card is blank and a tap opens the app.
      val url = snapshot?.optString("url")?.takeIf { it.isNotEmpty() }
      views.setOnClickPendingIntent(R.id.widget_root, open(context, url))
      views.setOnClickPendingIntent(R.id.widget_button, open(context, url))

      fun text(viewId: Int, value: String?, textColor: Int) {
        views.setTextViewText(viewId, value ?: "")
        views.setTextColor(viewId, textColor)
        views.setViewVisibility(viewId, if (value.isNullOrEmpty()) View.GONE else View.VISIBLE)
      }
      text(R.id.widget_eyebrow, snapshot?.optString("eyebrow"), accent)
      text(R.id.widget_title, snapshot?.optString("title"), ink)
      views.setViewVisibility(
        R.id.widget_button,
        if (snapshot == null) View.GONE else View.VISIBLE,
      )
      views.setTextViewText(R.id.widget_button_label, snapshot?.optString("button") ?: "")
      views.setTextColor(R.id.widget_button_label, onAccent)

      val dots = week?.optJSONArray("dots")
      views.setViewVisibility(R.id.widget_week, if (week == null) View.GONE else View.VISIBLE)
      text(R.id.widget_week_label, week?.optString("label"), muted)
      val emptyDot = Color.argb(0x55, Color.red(muted), Color.green(muted), Color.blue(muted))
      DOTS.forEachIndexed { index, dot ->
        if (dots != null && index < dots.length()) {
          views.setViewVisibility(dot, View.VISIBLE)
          views.setInt(dot, "setColorFilter", if (dots.optBoolean(index)) accent else emptyDot)
        } else {
          views.setViewVisibility(dot, View.GONE)
        }
      }
      manager.updateAppWidget(id, views)
    }
  }
}
