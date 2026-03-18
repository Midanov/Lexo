package com.example.lexo

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class LexoWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        appWidgetIds.forEach { updateWidget(context, appWidgetManager, it) }
    }

    companion object {
        /** Llama a esto desde NotificationBridge.syncStats() para refrescar todos los widgets */
        fun update(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, LexoWidget::class.java)
            )
            if (ids.isNotEmpty()) {
                ids.forEach { updateWidget(context, manager, it) }
            }
        }

        private fun updateWidget(
            context: Context,
            manager: AppWidgetManager,
            widgetId: Int
        ) {
            val prefs  = context.getSharedPreferences("lexo_stats", Context.MODE_PRIVATE)
            val total  = prefs.getInt("total", 0)
            val due    = prefs.getInt("due", 0)
            val streak = prefs.getInt("streak", 0)

            val views = RemoteViews(context.packageName, R.layout.lexo_widget)

            views.setTextViewText(R.id.widget_due,       "$due")
            views.setTextViewText(R.id.widget_label_due, if (due == 1) "pendiente" else "pendientes")
            views.setTextViewText(R.id.widget_total,     "$total palabras guardadas")
            views.setTextViewText(R.id.widget_streak,    "🔥  $streak días de racha")

            // Tap en el widget → abre la app
            val intent  = Intent(context, MainActivity::class.java)
            val pending = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pending)

            manager.updateAppWidget(widgetId, views)
        }
    }
}
