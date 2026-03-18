package com.example.lexo

import android.os.Bundle
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import android.webkit.WebResourceRequest

class MainActivity : AppCompatActivity() {

    private lateinit var ttsBridge: TTSBridge   // ← AGREGADO

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true                     // ← AGREGADO
        webView.settings.mediaPlaybackRequiresUserGesture = false   // ← AGREGADO

        // 🔊 Inicializar TTS
        ttsBridge = TTSBridge(this)                                 // ← AGREGADO
        webView.addJavascriptInterface(ttsBridge, "AndroidTTS")     // ← AGREGADO

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ) = assetLoader.shouldInterceptRequest(request.url)
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/Lexo.html")
    }

    override fun onDestroy() {   // ← AGREGADO
        super.onDestroy()
        ttsBridge.shutdown()
    }
}
