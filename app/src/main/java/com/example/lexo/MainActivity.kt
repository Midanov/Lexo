package com.example.lexo

import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebResourceRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

class MainActivity : AppCompatActivity() {

    // ── Bridges ────────────────────────────────────────────────
    private lateinit var ttsBridge: TTSBridge
    private lateinit var notifBridge: NotificationBridge

    // ── Permiso de notificaciones (Android 13+) ────────────────
    private val requestNotifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                // Se concedió el permiso — JS decide cuándo programar notificaciones
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val webView = WebView(this)
        setContentView(webView)
        window.setDecorFitsSystemWindows(false)

        webView.post {
            window.insetsController?.let { controller ->
                controller.hide(
                    android.view.WindowInsets.Type.statusBars() or
                            android.view.WindowInsets.Type.navigationBars()
                )

                controller.systemBarsBehavior =
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        }
        // ── Configuración WebView ──────────────────────────────
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
        }

        // ── Inicializar bridges ────────────────────────────────
        ttsBridge = TTSBridge(this)
        notifBridge = NotificationBridge(this)

        webView.addJavascriptInterface(ttsBridge, "AndroidTTS")
        webView.addJavascriptInterface(notifBridge, "NotificationBridge")

        // ── Asset Loader (mejor práctica en vez de file://) ────
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ) = assetLoader.shouldInterceptRequest(request.url)
        }

        // ── Cargar app ─────────────────────────────────────────
        webView.loadUrl("https://appassets.androidplatform.net/assets/Lexo.html")

        // ── Pedir permiso Android 13+ ──────────────────────────
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestNotifPermission.launch(
                android.Manifest.permission.POST_NOTIFICATIONS
            )
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        ttsBridge.shutdown()
    }
}
