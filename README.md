# 📱 Lexo App

## 🧩 Descripción

**Lexo** es una app móvil para Android que funciona como un diccionario interactivo de palabras en inglés.

Está hecha usando un enfoque híbrido con **WebView**, lo que básicamente significa que mezcla lo mejor de una app nativa con tecnologías web (HTML, CSS y JavaScript).

La idea es simple: una app rápida, ligera y que funcione sin internet para consultar vocabulario en cualquier momento.

---

## 🚀 ¿Qué hace la aplicación?

Con Lexo puedes:

* 🔍 Buscar palabras en inglés al instante  
* 📚 Explorar una lista de vocabulario ya cargada  
* 🧠 Ver información útil de cada palabra:
  * Traducción
  * Nivel CEFR (A1 - C2)
  * Categoría (general, business, tech, etc.)
  * Tipo de palabra (verbo, sustantivo, adjetivo...)  

* ⚡ Usarla sin conexión (offline)  
* 💾 Guardar datos localmente para que todo cargue más rápido  

---

## 🏗️ Cómo está construida

La app está dividida en dos partes:

### 📱 Android (Nativo)
* Usa un `WebView` como contenedor principal  
* Carga archivos locales desde `android_asset`  
* Maneja lo básico de la app  

### 🌐 Web (Frontend)
* HTML → estructura  
* CSS → estilos  
* JavaScript → lógica y comportamiento  

### 💾 Datos
* Un archivo `words.json` con las palabras  
* IndexedDB para guardar todo localmente y no depender del JSON siempre  

---

## ⚙️ Cómo funciona (en simple)

1. La app abre y carga un `WebView`  
2. Se abre el archivo `Lexo.html`  
3. JavaScript:
   * Lee el `words.json`
   * Guarda los datos en IndexedDB (solo la primera vez)  

4. Después de eso:
   * Todo se carga desde IndexedDB  
   * La app va mucho más rápida 🚀  

---
## Historial de cambios

### [0.1] - 2026-03-17
#### ✨ Añadido
* Estructura base del proyecto y primer commit. Implementación de base json.

- Se actualizó y depuró el código para permitir la conexión con la API del diccionario.
- Se habilitó la obtención de información en línea para las nuevas palabras agregadas por el usuario.
- Se integró una animación al momento de agregar palabras.
- Se actualizó el logo a una versión con mejor calidad (menos borroso).
- Se añadió un test funcional.
- Se implementó la funcionalidad de **Text-to-Speech (TTS)**.

## 📅 2026-03-18
 
 
- Integración con API de **Wikipedia** para enriquecer palabras con imágenes (con sistema de caché y validación de relevancia).
- Implementación de **notificaciones push** para fomentar el hábito diario y mejorar el engagement.
- Desarrollo de **widget móvil** para visualizar progreso y acceder rápidamente a sesiones de estudio. (pendiente de validación)

