package com.example.lexo
import android.content.Context
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import java.util.Locale

/**
 * Puente nativo entre el WebView de Lexo y el TextToSpeech de Android.
 *
 * CÓMO USARLO en tu Activity / Fragment:
 *
 *   val ttsBridge = TTSBridge(this)
 *   webView.addJavascriptInterface(ttsBridge, "AndroidTTS")
 *
 * Y cuando destruyas la Activity:
 *
 *   override fun onDestroy() {
 *       super.onDestroy()
 *       ttsBridge.shutdown()
 *   }
 */
class TTSBridge(context: Context) : TextToSpeech.OnInitListener {

    private val tts = TextToSpeech(context.applicationContext, this)
    private var ready = false

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts.language = Locale.US   // default: inglés
            ready = true
        }
    }

    /** Pronuncia texto en inglés (llamado desde JS: AndroidTTS.speak(text)) */
    @JavascriptInterface
    fun speak(text: String) {
        if (!ready) return
        tts.language = Locale.US
        tts.setSpeechRate(0.85f)
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "lexo_en")
    }

    /** Pronuncia texto en español (llamado desde JS: AndroidTTS.speakEs(text)) */
    @JavascriptInterface
    fun speakEs(text: String) {
        if (!ready) return
        tts.language = Locale("es", "ES")
        tts.setSpeechRate(0.9f)
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "lexo_es")
        // Restaurar inglés como idioma por defecto
        tts.language = Locale.US
    }

    /** Llama esto en onDestroy() de tu Activity */
    fun shutdown() {
        tts.stop()
        tts.shutdown()
    }
}
