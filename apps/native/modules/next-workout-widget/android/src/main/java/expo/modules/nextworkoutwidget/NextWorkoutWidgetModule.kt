package expo.modules.nextworkoutwidget

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Stores the JSON snapshot the app builds and asks the widget to redraw. The widget never reads
 * the app's database; this call is its only input.
 */
class NextWorkoutWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NextWorkoutWidget")
    Function("setSnapshot") { json: String ->
      val context = context()
      WidgetSnapshotStore.write(context, json)
      NextWorkoutWidgetProvider.refreshAll(context)
    }
  }

  private fun context(): Context = requireNotNull(appContext.reactContext)
}
