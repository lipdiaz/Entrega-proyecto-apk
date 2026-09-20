package cl.hegc.radioterapia;

import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class AndroidBridge {
    private final MainActivity activity;
    private final WebView webView;
    private final SecureStore secureStore;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    AndroidBridge(MainActivity activity, WebView webView, SecureStore secureStore) {
        this.activity = activity;
        this.webView = webView;
        this.secureStore = secureStore;
    }

    @JavascriptInterface
    public boolean isAndroid() {
        return true;
    }

    @JavascriptInterface
    public String getItem(String key) {
        try {
            String value = secureStore.get(key);
            return value == null ? "" : value;
        } catch (Exception exception) {
            return "";
        }
    }

    @JavascriptInterface
    public void setItem(String key, String value) {
        secureStore.put(key, value);
    }

    @JavascriptInterface
    public boolean hasMailPassword() {
        try {
            String raw = secureStore.get("mail_config");
            return raw != null && !new JSONObject(raw).optString("password").trim().isEmpty();
        } catch (Exception ignored) {
            return false;
        }
    }

    @JavascriptInterface
    public void saveMailConfig(String configJson, String newPassword) {
        try {
            JSONObject config = new JSONObject(configJson);
            String currentRaw = secureStore.get("mail_config");
            if (newPassword == null || newPassword.trim().isEmpty()) {
                String existing = currentRaw == null ? "" : new JSONObject(currentRaw).optString("password");
                config.put("password", existing);
            } else {
                config.put("password", newPassword);
            }
            secureStore.put("mail_config", config.toString());
            ReportScheduler.schedule(activity, config.optBoolean("enabled", false));
            activity.notifyWeb(true, "Configuración de correo guardada en forma cifrada.");
        } catch (Exception exception) {
            activity.notifyWeb(false, "No fue posible guardar el correo: " + exception.getMessage());
        }
    }

    @JavascriptInterface
    public void sendReport(String rowsJson, String title) {
        executor.execute(() -> {
            try {
                ReportMailer.send(activity, secureStore, rowsJson, title);
                activity.notifyWeb(true, "Informe enviado correctamente al correo configurado.");
            } catch (Exception exception) {
                activity.notifyWeb(false, "No fue posible enviar el informe: " + exception.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void exportReport(String rowsJson, String title, String format) {
        executor.execute(() -> {
            try {
                byte[] bytes;
                String extension;
                String mime;
                if ("pdf".equalsIgnoreCase(format)) {
                    bytes = ReportGenerator.pdf(activity, rowsJson, title);
                    extension = ".pdf";
                    mime = "application/pdf";
                } else {
                    bytes = ReportGenerator.excel(rowsJson, title);
                    extension = ".xls";
                    mime = "application/vnd.ms-excel";
                }
                File directory = new File(activity.getCacheDir(), "reports");
                if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("No se pudo crear la carpeta temporal.");
                File file = new File(directory, "informe-accesos-hegc" + extension);
                try (FileOutputStream output = new FileOutputStream(file)) {
                    output.write(bytes);
                }
                Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", file);
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType(mime);
                share.putExtra(Intent.EXTRA_STREAM, uri);
                share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.runOnUiThread(() -> activity.startActivity(Intent.createChooser(share, "Guardar o compartir informe")));
            } catch (Exception exception) {
                activity.notifyWeb(false, "No fue posible exportar el informe: " + exception.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void createBackup() {
        try {
            JSONObject backup = new JSONObject();
            backup.put("version", 1);
            backup.put("people", jsonValue("bunker_people_v1", "[]"));
            backup.put("access", jsonValue("bunker_access_v1", "[]"));
            backup.put("admins", jsonValue("bunker_admins_v1", "[]"));
            backup.put("reportSettings", jsonValue("bunker_report_settings_v1", "{}"));
            activity.createBackup(backup.toString(2));
        } catch (Exception exception) {
            activity.notifyWeb(false, "No fue posible crear el respaldo: " + exception.getMessage());
        }
    }

    @JavascriptInterface
    public void restoreBackup() {
        activity.restoreBackup();
    }

    private Object jsonValue(String key, String fallback) throws Exception {
        String raw = secureStore.get(key);
        String value = raw == null || raw.trim().isEmpty() ? fallback : raw;
        return new org.json.JSONTokener(value).nextValue();
    }
}
