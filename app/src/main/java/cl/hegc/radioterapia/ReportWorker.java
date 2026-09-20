package cl.hegc.radioterapia;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.TextStyle;
import java.util.Locale;

public final class ReportWorker extends Worker {
    public ReportWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        SecureStore store = new SecureStore(getApplicationContext());
        try {
            String configRaw = store.get("mail_config");
            if (configRaw == null) return Result.failure();
            JSONObject config = new JSONObject(configRaw);
            if (!config.optBoolean("enabled", false)) return Result.success();

            String accessRaw = store.get("bunker_access_v1");
            JSONArray access = new JSONArray(accessRaw == null ? "[]" : accessRaw);
            JSONArray monthly = currentMonth(access);
            LocalDate now = LocalDate.now();
            String month = now.getMonth().getDisplayName(TextStyle.FULL, new Locale("es", "CL"));
            String title = "Informe mensual de accesos - " + month + " " + now.getYear();
            ReportMailer.send(getApplicationContext(), store, monthly.toString(), title);
            ReportScheduler.schedule(getApplicationContext(), true);
            return Result.success();
        } catch (Exception exception) {
            if (getRunAttemptCount() < 3) return Result.retry();
            ReportScheduler.schedule(getApplicationContext(), true);
            return Result.failure();
        }
    }

    private JSONArray currentMonth(JSONArray rows) {
        LocalDate first = LocalDate.now().withDayOfMonth(1);
        LocalDate next = first.plusMonths(1);
        JSONArray filtered = new JSONArray();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) continue;
            try {
                LocalDate date = Instant.parse(row.optString("entryAt"))
                        .atZone(ZoneId.systemDefault()).toLocalDate();
                if (!date.isBefore(first) && date.isBefore(next)) filtered.put(row);
            } catch (Exception ignored) {
                // Un registro inválido no bloquea el informe completo.
            }
        }
        return filtered;
    }
}
