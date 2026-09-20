package cl.hegc.radioterapia;

import android.content.Context;

import org.json.JSONObject;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

final class ReportMailer {
    private ReportMailer() {}

    static void send(Context context, SecureStore store, String rowsJson, String title) throws Exception {
        String configRaw = store.get("mail_config");
        if (configRaw == null || configRaw.trim().isEmpty()) throw new IllegalStateException("El correo institucional aún no está configurado.");
        JSONObject config = new JSONObject(configRaw);
        List<SmtpClient.Attachment> attachments = new ArrayList<>();
        String suffix = LocalDate.now().toString();
        if (config.optBoolean("pdf", true)) {
            attachments.add(new SmtpClient.Attachment(
                    "informe-accesos-" + suffix + ".pdf",
                    "application/pdf",
                    ReportGenerator.pdf(context, rowsJson, title)));
        }
        if (config.optBoolean("excel", true)) {
            attachments.add(new SmtpClient.Attachment(
                    "informe-accesos-" + suffix + ".xls",
                    "application/vnd.ms-excel",
                    ReportGenerator.excel(rowsJson, title)));
        }
        if (attachments.isEmpty()) throw new IllegalStateException("No hay formatos de informe seleccionados.");
        String body = "Se adjunta el informe de registros de acceso del Centro de Radioterapia Infantojuvenil HEGC.\n\n"
                + "Este correo fue generado automáticamente por la aplicación de control de acceso.";
        SmtpClient.send(config, title, body, attachments);
    }
}
