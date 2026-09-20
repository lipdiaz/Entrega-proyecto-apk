package cl.hegc.radioterapia;

import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONObject;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.TemporalAdjusters;
import java.util.concurrent.TimeUnit;

final class ReportScheduler {
    private static final String UNIQUE_NAME = "hegc-monthly-access-report";

    private ReportScheduler() {}

    static void schedule(Context context, boolean enabled) {
        WorkManager manager = WorkManager.getInstance(context);
        if (!enabled) {
            manager.cancelUniqueWork(UNIQUE_NAME);
            return;
        }
        try {
            SecureStore store = new SecureStore(context);
            String configRaw = store.get("mail_config");
            if (configRaw == null) return;
            JSONObject config = new JSONObject(configRaw);
            LocalDateTime next = nextRun(config, LocalDateTime.now());
            long delay = Math.max(1, Duration.between(LocalDateTime.now(), next).toMillis());
            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(ReportWorker.class)
                    .setInitialDelay(delay, TimeUnit.MILLISECONDS)
                    .setConstraints(constraints)
                    .build();
            manager.enqueueUniqueWork(UNIQUE_NAME, ExistingWorkPolicy.REPLACE, request);
        } catch (Exception ignored) {
            // La interfaz informará errores al probar la configuración.
        }
    }

    static LocalDateTime nextRun(JSONObject config, LocalDateTime now) {
        LocalTime time;
        try {
            time = LocalTime.parse(config.optString("time", "08:00"));
        } catch (Exception ignored) {
            time = LocalTime.of(8, 0);
        }
        LocalDate candidate = candidate(config, now.toLocalDate());
        LocalDateTime result = LocalDateTime.of(candidate, time);
        if (!result.isAfter(now)) {
            result = LocalDateTime.of(candidate(config, now.toLocalDate().plusMonths(1).withDayOfMonth(1)), time);
        }
        return result;
    }

    private static LocalDate candidate(JSONObject config, LocalDate reference) {
        LocalDate first = reference.withDayOfMonth(1);
        String type = config.optString("scheduleType", "last-day");
        if ("day".equals(type)) {
            int day = Math.max(1, Math.min(28, config.optInt("dayOfMonth", 1)));
            return first.withDayOfMonth(day);
        }
        if ("last-weekday".equals(type)) {
            int jsDay = config.optInt("weekday", 1);
            int javaDay = jsDay == 0 ? 7 : jsDay;
            return first.with(TemporalAdjusters.lastInMonth(DayOfWeek.of(javaDay)));
        }
        return first.with(TemporalAdjusters.lastDayOfMonth());
    }
}
