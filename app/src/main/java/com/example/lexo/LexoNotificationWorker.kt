package com.example.lexo

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Worker
import androidx.work.WorkerParameters

class LexoNotificationWorker(
    private val context: Context,
    params: WorkerParameters
) : Worker(context, params) {

    companion object {
        const val CHANNEL_ID = "lexo_daily"
    }

    override fun doWork(): Result {
        val prefs  = context.getSharedPreferences("lexo_stats", Context.MODE_PRIVATE)
        val due    = prefs.getInt("due", 0)
        val streak = prefs.getInt("streak", 0)

        createChannel()

        // Tap en la notificación → abre la app
        val intent  = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pending = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Mensaje dinámico según el estado del usuario
        val (title, body) = when {
            due == 0   -> Pair("¡Todo al día! 🌟",
                               "Sin palabras pendientes. Explora nuevas palabras.")
            streak > 3 -> Pair("No pierdas tu racha de $streak días 🔥",
                               "Tienes $due ${if(due==1)"palabra" else "palabras"} esperándote.")
            due <= 5   -> Pair("Sesión rápida 📚",
                               "Solo $due ${if(due==1)"palabra" else "palabras"} — menos de 2 minutos.")
            else       -> Pair("Tu sesión de hoy te espera 📖",
                               "Tienes $due palabras listas para repasar.")
        }

        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_edit)  // reemplaza con tu ícono
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(1001, notif)

        return Result.success()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Recordatorio diario Lexo",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Recordatorio para tu sesión de estudio diaria"
            }
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }
}
