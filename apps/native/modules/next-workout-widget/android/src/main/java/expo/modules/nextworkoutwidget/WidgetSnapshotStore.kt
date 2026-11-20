package expo.modules.nextworkoutwidget

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * The snapshot lives in the no-backup directory: it is derived data, so it must not be restored
 * onto another device by Auto Backup.
 */
internal object WidgetSnapshotStore {
  private const val FILE = "next-workout-widget.json"

  private fun file(context: Context) = File(context.noBackupFilesDir, FILE)

  fun write(context: Context, json: String) {
    val target = file(context)
    val temp = File(target.parentFile, "$FILE.tmp")
    temp.writeText(json)
    if (!temp.renameTo(target)) {
      target.writeText(json)
      temp.delete()
    }
  }

  fun read(context: Context): JSONObject? = try {
    file(context).takeIf { it.exists() }?.readText()?.let { JSONObject(it) }
  } catch (_: Exception) {
    null
  }
}
