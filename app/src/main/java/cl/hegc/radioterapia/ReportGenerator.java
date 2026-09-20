package cl.hegc.radioterapia;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Locale;

final class ReportGenerator {
    private static final String[] HEADERS = {
            "Nombre", "RUT", "Tipo", "Motivo", "Empresa/servicio", "Entrada", "Salida", "Permanencia"
    };
    private static final int[] WIDTHS = {130, 82, 60, 105, 110, 92, 92, 70};

    private ReportGenerator() {}

    static byte[] pdf(Context context, String rowsJson, String title) throws Exception {
        JSONArray rows = new JSONArray(rowsJson);
        PdfDocument document = new PdfDocument();
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint header = new Paint(Paint.ANTI_ALIAS_FLAG);
        header.setColor(Color.rgb(15, 76, 129));
        Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        grid.setStyle(Paint.Style.STROKE);
        grid.setStrokeWidth(0.7f);
        grid.setColor(Color.rgb(180, 190, 205));
        Bitmap logo = BitmapFactory.decodeResource(context.getResources(), R.drawable.logo_hegc);

        int rowIndex = 0;
        int pageNumber = 1;
        do {
            PdfDocument.PageInfo pageInfo = new PdfDocument.PageInfo.Builder(842, 595, pageNumber).create();
            PdfDocument.Page page = document.startPage(pageInfo);
            Canvas canvas = page.getCanvas();
            canvas.drawColor(Color.WHITE);
            if (logo != null) canvas.drawBitmap(logo, null, new android.graphics.Rect(30, 20, 86, 76), text);

            text.setColor(Color.rgb(20, 35, 55));
            text.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            text.setTextSize(16);
            canvas.drawText("Centro de Radioterapia Infantojuvenil HEGC", 100, 43, text);
            text.setTypeface(Typeface.DEFAULT);
            text.setTextSize(10);
            canvas.drawText(title, 100, 61, text);
            canvas.drawText("Generado: " + new SimpleDateFormat("dd-MM-yyyy HH:mm", new Locale("es", "CL")).format(new Date()), 650, 43, text);

            int x = 26;
            int y = 94;
            text.setTextSize(7.2f);
            text.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            for (int i = 0; i < HEADERS.length; i++) {
                canvas.drawRect(x, y, x + WIDTHS[i], y + 24, header);
                text.setColor(Color.WHITE);
                canvas.drawText(HEADERS[i], x + 3, y + 15, text);
                x += WIDTHS[i];
            }
            y += 24;
            text.setTypeface(Typeface.DEFAULT);
            text.setTextSize(6.8f);

            int rowsOnPage = 0;
            while (rowIndex < rows.length() && rowsOnPage < 25) {
                JSONObject row = rows.getJSONObject(rowIndex++);
                String[] values = rowValues(row);
                x = 26;
                for (int i = 0; i < values.length; i++) {
                    canvas.drawRect(x, y, x + WIDTHS[i], y + 17, grid);
                    text.setColor(Color.rgb(30, 40, 55));
                    canvas.drawText(ellipsize(values[i], text, WIDTHS[i] - 6), x + 3, y + 11, text);
                    x += WIDTHS[i];
                }
                y += 17;
                rowsOnPage++;
            }
            text.setTextSize(8);
            canvas.drawText("Página " + pageNumber, 760, 575, text);
            document.finishPage(page);
            pageNumber++;
        } while (rowIndex < rows.length());

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        document.writeTo(output);
        document.close();
        return output.toByteArray();
    }

    static byte[] excel(String rowsJson, String title) throws Exception {
        JSONArray rows = new JSONArray(rowsJson);
        StringBuilder html = new StringBuilder();
        html.append("<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head><body>")
                .append("<h2>Centro de Radioterapia Infantojuvenil HEGC</h2><h3>")
                .append(escape(title)).append("</h3><table border=\"1\"><thead><tr>");
        for (String heading : HEADERS) html.append("<th>").append(escape(heading)).append("</th>");
        html.append("</tr></thead><tbody>");
        for (int i = 0; i < rows.length(); i++) {
            html.append("<tr>");
            for (String value : rowValues(rows.getJSONObject(i))) {
                html.append("<td>").append(escape(value)).append("</td>");
            }
            html.append("</tr>");
        }
        html.append("</tbody></table></body></html>");
        return ("\ufeff" + html).getBytes(StandardCharsets.UTF_8);
    }

    private static String[] rowValues(JSONObject row) {
        String entry = humanDate(row.optString("entryAt"));
        String exit = row.optString("exitAt");
        return new String[]{
                row.optString("name"), formatRut(row.optString("rut")), row.optString("type"),
                row.optString("motive"), row.optString("organization"), entry,
                exit.trim().isEmpty() || "null".equals(exit) ? "Dentro" : humanDate(exit), duration(row.optString("entryAt"), exit)
        };
    }

    private static String humanDate(String iso) {
        try {
            Instant instant = Instant.parse(iso);
            return new SimpleDateFormat("dd-MM-yyyy HH:mm", new Locale("es", "CL")).format(Date.from(instant));
        } catch (Exception ignored) {
            return iso;
        }
    }

    private static String duration(String start, String end) {
        if (end == null || end.trim().isEmpty() || "null".equals(end)) return "En curso";
        try {
            long minutes = Math.max(0, Duration.between(Instant.parse(start), Instant.parse(end)).toMinutes());
            return minutes >= 60 ? (minutes / 60) + "h " + (minutes % 60) + "m" : minutes + " min";
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String formatRut(String value) {
        String rut = value == null ? "" : value.replace(".", "").replace("-", "").trim();
        if (rut.length() < 2) return rut;
        String body = rut.substring(0, rut.length() - 1);
        StringBuilder formatted = new StringBuilder();
        for (int i = 0; i < body.length(); i++) {
            if (i > 0 && (body.length() - i) % 3 == 0) formatted.append('.');
            formatted.append(body.charAt(i));
        }
        return formatted + "-" + rut.charAt(rut.length() - 1);
    }

    private static String ellipsize(String value, Paint paint, float width) {
        String text = value == null ? "" : value;
        if (paint.measureText(text) <= width) return text;
        while (text.length() > 1 && paint.measureText(text + "…") > width) text = text.substring(0, text.length() - 1);
        return text + "…";
    }

    private static String escape(String value) {
        return (value == null ? "" : value)
                .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }
}
