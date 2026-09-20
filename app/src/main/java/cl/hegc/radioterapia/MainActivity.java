package cl.hegc.radioterapia;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int CREATE_BACKUP_REQUEST = 7001;
    private static final int RESTORE_BACKUP_REQUEST = 7002;
    private WebView webView;
    private SecureStore secureStore;
    private String pendingBackup;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        secureStore = new SecureStore(this);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AndroidBridge(this, webView, secureStore), "Android");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    void createBackup(String json) {
        runOnUiThread(() -> {
            pendingBackup = json;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, "respaldo-control-acceso-hegc.json");
            startActivityForResult(intent, CREATE_BACKUP_REQUEST);
        });
    }

    void restoreBackup() {
        runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            startActivityForResult(intent, RESTORE_BACKUP_REQUEST);
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        try {
            if (requestCode == CREATE_BACKUP_REQUEST && pendingBackup != null) {
                try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new IllegalStateException("No se pudo abrir el archivo de destino.");
                    output.write(pendingBackup.getBytes(StandardCharsets.UTF_8));
                }
                pendingBackup = null;
                notifyWeb(true, "Respaldo guardado correctamente.");
            } else if (requestCode == RESTORE_BACKUP_REQUEST) {
                String json;
                try (InputStream input = getContentResolver().openInputStream(uri)) {
                    if (input == null) throw new IllegalStateException("No se pudo abrir el respaldo.");
                    json = new String(readFully(input), StandardCharsets.UTF_8);
                }
                JSONObject backup = new JSONObject(json);
                restoreKey(backup, "people", "bunker_people_v1");
                restoreKey(backup, "access", "bunker_access_v1");
                restoreKey(backup, "admins", "bunker_admins_v1");
                restoreKey(backup, "reportSettings", "bunker_report_settings_v1");
                notifyWeb(true, "Respaldo restaurado. La aplicación se reiniciará.");
                webView.postDelayed(() -> webView.reload(), 800);
            }
        } catch (Exception exception) {
            notifyWeb(false, "No fue posible procesar el respaldo: " + exception.getMessage());
        }
    }

    private void restoreKey(JSONObject backup, String source, String target) throws Exception {
        if (!backup.has(source)) throw new IllegalArgumentException("El respaldo no contiene " + source + ".");
        secureStore.put(target, backup.get(source).toString());
    }

    private byte[] readFully(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        return output.toByteArray();
    }

    void notifyWeb(boolean success, String message) {
        String script = "window.onNativeResult && window.onNativeResult("
                + success + "," + JSONObject.quote(message) + ")";
        runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
