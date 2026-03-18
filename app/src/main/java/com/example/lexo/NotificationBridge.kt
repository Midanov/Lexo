package com.example.lexo

import android.content.Context
import android.webkit.JavascriptInterface
import androidx.work.*
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * Puente JS → Android para notificaciones y widget.
 *
 * En tu Activity:
 *   val notifBridge = NotificationBridge(this)
 *   webView.addJavascriptInterface(notifBridge, "NotificationBridge")
 */
class NotificationBridge(private val context: Context) {

    /** Llamado desde persist() en script.js cada vez que cambian los datos */
    @JavascriptInterface
    fun syncStats(total: Int, due: Int, streak: Int) {
        context.getSharedPreferences("lexo_stats", Context.MODE_PRIVATE)
            .edit()
            .putInt("total", total)
            .putInt("due", due)
            .putInt("streak", streak)
            .apply()
        LexoWidget.update(context)
    }

    /** Programa un recordatorio diario a la hora indicada */
    @JavascriptInterface
    fun scheduleDaily(hour: Int, minute: Int) {
        val now    = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (before(now)) add(Calendar.DATE, 1)  // si ya pasó hoy, programa para mañana
        }
        val delay = target.timeInMillis - now.timeInMillis

        val request = PeriodicWorkRequestBuilder<LexoNotificationWorker>(1, TimeUnit.DAYS)
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setConstraints(Constraints.Builder()
                .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
                .build())
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "lexo_daily_notif",
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )
    }

    /** Cancela el recordatorio diario */
    @JavascriptInterface
    fun cancelDaily() {
        WorkManager.getInstance(context).cancelUniqueWork("lexo_daily_notif")
    }
}
