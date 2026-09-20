package cl.hegc.radioterapia;

import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import javax.net.ssl.SSLSocketFactory;

final class SmtpClient {
    static final class Attachment {
        final String name;
        final String mime;
        final byte[] bytes;

        Attachment(String name, String mime, byte[] bytes) {
            this.name = name;
            this.mime = mime;
            this.bytes = bytes;
        }
    }

    private SmtpClient() {}

    static void send(JSONObject config, String subject, String body, List<Attachment> attachments) throws Exception {
        String host = required(config, "host");
        int port = config.optInt("port", 587);
        String security = config.optString("security", "STARTTLS");
        String sender = required(config, "sender");
        String recipientText = required(config, "recipient");
        String username = config.optString("username");
        String password = config.optString("password");

        Socket socket = "SSL/TLS".equalsIgnoreCase(security)
                ? SSLSocketFactory.getDefault().createSocket(host, port)
                : new Socket(host, port);
        socket.setSoTimeout(30000);
        Connection connection = new Connection(socket);
        connection.expect(220);
        connection.command("EHLO android-hegc", 250);

        if ("STARTTLS".equalsIgnoreCase(security)) {
            connection.command("STARTTLS", 220);
            socket = ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(socket, host, port, true);
            socket.setSoTimeout(30000);
            connection = new Connection(socket);
            connection.command("EHLO android-hegc", 250);
        }

        if (!username.trim().isEmpty()) {
            connection.command("AUTH LOGIN", 334);
            connection.command(b64(username.getBytes(StandardCharsets.UTF_8)), 334);
            connection.command(b64(password.getBytes(StandardCharsets.UTF_8)), 235);
        }

        connection.command("MAIL FROM:<" + sender + ">", 250);
        for (String recipient : recipients(recipientText)) {
            connection.command("RCPT TO:<" + recipient + ">", 250, 251);
        }
        connection.command("DATA", 354);
        connection.writeData(message(sender, recipientText, subject, body, attachments));
        connection.expect(250);
        connection.command("QUIT", 221);
        socket.close();
    }

    private static String message(String sender, String recipients, String subject, String body, List<Attachment> attachments) {
        String boundary = "HEGC-" + UUID.randomUUID();
        StringBuilder message = new StringBuilder();
        message.append("From: ").append(sender).append("\r\n")
                .append("To: ").append(recipients).append("\r\n")
                .append("Subject: =?UTF-8?B?").append(b64(subject.getBytes(StandardCharsets.UTF_8))).append("?=\r\n")
                .append("MIME-Version: 1.0\r\n")
                .append("Content-Type: multipart/mixed; boundary=\"").append(boundary).append("\"\r\n\r\n")
                .append("--").append(boundary).append("\r\n")
                .append("Content-Type: text/plain; charset=UTF-8\r\n")
                .append("Content-Transfer-Encoding: base64\r\n\r\n")
                .append(wrap(b64(body.getBytes(StandardCharsets.UTF_8)))).append("\r\n");
        for (Attachment attachment : attachments) {
            message.append("--").append(boundary).append("\r\n")
                    .append("Content-Type: ").append(attachment.mime).append("; name=\"").append(attachment.name).append("\"\r\n")
                    .append("Content-Disposition: attachment; filename=\"").append(attachment.name).append("\"\r\n")
                    .append("Content-Transfer-Encoding: base64\r\n\r\n")
                    .append(wrap(b64(attachment.bytes))).append("\r\n");
        }
        message.append("--").append(boundary).append("--\r\n");
        return message.toString();
    }

    private static List<String> recipients(String value) {
        List<String> recipients = new ArrayList<>();
        for (String part : value.split("[,;]")) {
            String recipient = part.trim();
            if (!recipient.isEmpty()) recipients.add(recipient);
        }
        if (recipients.isEmpty()) throw new IllegalArgumentException("No hay destinatarios válidos.");
        return recipients;
    }

    private static String required(JSONObject object, String key) {
        String value = object.optString(key).trim();
        if (value.isEmpty()) throw new IllegalArgumentException("Falta configurar " + key + ".");
        return value;
    }

    private static String b64(byte[] bytes) {
        return Base64.encodeToString(bytes, Base64.NO_WRAP);
    }

    private static String wrap(String value) {
        StringBuilder wrapped = new StringBuilder();
        for (int i = 0; i < value.length(); i += 76) {
            wrapped.append(value, i, Math.min(i + 76, value.length())).append("\r\n");
        }
        return wrapped.toString();
    }

    private static final class Connection {
        private final BufferedReader reader;
        private final BufferedWriter writer;

        Connection(Socket socket) throws Exception {
            reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
            writer = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.US_ASCII));
        }

        void command(String command, int... expectedCodes) throws Exception {
            writer.write(command + "\r\n");
            writer.flush();
            expect(expectedCodes);
        }

        void writeData(String data) throws Exception {
            for (String line : data.replace("\r\n", "\n").split("\n", -1)) {
                writer.write(line.startsWith(".") ? "." + line : line);
                writer.write("\r\n");
            }
            writer.write(".\r\n");
            writer.flush();
        }

        void expect(int... expectedCodes) throws Exception {
            String line;
            String last = null;
            do {
                line = reader.readLine();
                if (line == null) throw new IllegalStateException("El servidor de correo cerró la conexión.");
                last = line;
            } while (line.length() >= 4 && line.charAt(3) == '-');
            int code = Integer.parseInt(last.substring(0, 3));
            for (int expected : expectedCodes) if (code == expected) return;
            throw new IllegalStateException("Respuesta SMTP inesperada: " + code + ".");
        }
    }
}
