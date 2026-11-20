package com.procesadordetexto.android;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;

/** Recognition is explicitly launched in the device's installed speech app. */
public final class AndroidVoice {
    private static final int DICTATION = 434;
    private final Activity activity;
    private final WebView view;
    private boolean destroyed;
    private String dictationId;
    private TextToSpeech engine;
    private boolean engineReady;
    private String utteranceId;
    private String pendingText;
    private String pendingLanguage;
    private float pendingRate;

    AndroidVoice(Activity activity, WebView view) {
        this.activity = activity;
        this.view = view;
    }

    private void report(String event, String id, String value) {
        if (destroyed || activity.isFinishing()) return;
        view.evaluateJavascript("window.PT && PT.androidVoice && PT.androidVoice.result("
                + JSONObject.quote(event) + "," + JSONObject.quote(id) + ","
                + JSONObject.quote(value) + ")", null);
    }

    @JavascriptInterface
    public void dictate(String id, String language) {
        activity.runOnUiThread(() -> {
            if (destroyed || dictationId != null || !activity.hasWindowFocus()) {
                report("dictation-error", id, "Vuelve al documento para iniciar el dictado.");
                return;
            }
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                    .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                    .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    .putExtra(RecognizerIntent.EXTRA_PROMPT, "Dictar en el documento");
            try {
                dictationId = id;
                activity.startActivityForResult(intent, DICTATION);
            } catch (ActivityNotFoundException | SecurityException e) {
                dictationId = null;
                report("dictation-error", id, "No hay un servicio de dictado disponible. Puedes usar el micrófono de tu teclado.");
            }
        });
    }

    boolean onActivityResult(int request, int result, Intent data) {
        if (request != DICTATION) return false;
        String id = dictationId;
        dictationId = null;
        if (id != null) {
            ArrayList<String> words = result == Activity.RESULT_OK && data != null
                    ? data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) : null;
            String text = words == null || words.isEmpty() || words.get(0) == null ? "" : words.get(0);
            report("dictation", id, text);
        }
        return true;
    }

    @JavascriptInterface
    public void speak(String id, String text, String language, double rate) {
        activity.runOnUiThread(() -> {
            if (destroyed) return;
            if (text == null || text.length() > TextToSpeech.getMaxSpeechInputLength()) {
                report("speech-error", id, "El fragmento supera el tamaño admitido por el motor de voz.");
                return;
            }
            utteranceId = id;
            pendingText = text;
            pendingLanguage = language;
            pendingRate = (float) Math.max(0.5, Math.min(2.0, rate));
            if (engineReady) {
                speakPending();
            } else if (engine == null) {
                engine = new TextToSpeech(activity.getApplicationContext(),
                        status -> view.post(() -> onEngineReady(status)));
            }
        });
    }

    private void onEngineReady(int status) {
        if (destroyed) return;
        if (status != TextToSpeech.SUCCESS) {
            speechError("Android no pudo iniciar un motor de lectura. Comprueba las voces instaladas.");
            if (engine != null) engine.shutdown();
            engine = null;
            return;
        }
        engineReady = true;
        engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {}
            @Override public void onDone(String id) {
                activity.runOnUiThread(() -> {
                    if (id.equals(utteranceId)) {
                        utteranceId = null;
                        report("speech-done", id, "");
                    }
                });
            }
            @Override public void onError(String id) {
                activity.runOnUiThread(() -> {
                    if (id.equals(utteranceId)) speechError("El motor de voz no pudo leer este fragmento.");
                });
            }
        });
        if (pendingText != null) speakPending();
    }

    private void speakPending() {
        String text = pendingText;
        pendingText = null;
        if (engine.setLanguage(Locale.forLanguageTag(pendingLanguage)) < TextToSpeech.LANG_AVAILABLE) {
            speechError("Falta una voz para el idioma del documento. Puedes instalarla en los ajustes de Android.");
            return;
        }
        engine.setSpeechRate(pendingRate);
        if (engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId) == TextToSpeech.ERROR) {
            speechError("Android no pudo iniciar la lectura en voz alta.");
        }
    }

    private void speechError(String message) {
        String id = utteranceId;
        utteranceId = null;
        pendingText = null;
        if (id != null) report("speech-error", id, message);
    }

    @JavascriptInterface
    public void stop() { activity.runOnUiThread(this::stopReading); }

    private void stopReading() {
        utteranceId = null;
        pendingText = null;
        if (engine != null && engineReady) engine.stop();
    }

    void destroy() {
        destroyed = true;
        stopReading();
        if (engine != null) engine.shutdown();
        engine = null;
        engineReady = false;
        dictationId = null;
    }
}
