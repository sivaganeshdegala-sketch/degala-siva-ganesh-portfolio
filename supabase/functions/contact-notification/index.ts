const allowedMethods = "POST, OPTIONS";
const allowedHeaders = "authorization, x-client-info, apikey, content-type";

function response(request: Request, status: number, body: Record<string, unknown>) {
    const origin = request.headers.get("origin") || "";
    const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    const headers = new Headers({
        "Content-Type": "application/json",
        "Vary": "Origin"
    });

    if (allowedOrigins.includes(origin)) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Methods", allowedMethods);
        headers.set("Access-Control-Allow-Headers", allowedHeaders);
    }

    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    })[character] || character);
}

Deno.serve(async (request: Request) => {
    const origin = request.headers.get("origin") || "";
    const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

    if (!allowedOrigins.includes(origin)) {
        return response(request, 403, { error: "Origin not allowed." });
    }

    if (request.method === "OPTIONS") {
        return response(request, 204, {});
    }
    if (request.method !== "POST") {
        return response(request, 405, { error: "Method not allowed." });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const recipient = Deno.env.get("CONTACT_NOTIFICATION_TO");
    const sender = Deno.env.get("CONTACT_NOTIFICATION_FROM");
    if (!resendApiKey || !recipient || !sender) {
        return response(request, 503, { error: "Email notifications are not configured." });
    }

    let payload: { name?: unknown; email?: unknown; message?: unknown };
    try {
        payload = await request.json();
    } catch {
        return response(request, 400, { error: "Invalid request body." });
    }

    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    if (!name || name.length > 120 || !message || message.length > 10000 ||
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) {
        return response(request, 400, { error: "Please provide a valid name, email, and message." });
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message).replace(/\r?\n/g, "<br>");
    try {
        const resendResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${resendApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: sender,
                to: [recipient],
                reply_to: email,
                subject: `Portfolio contact from ${name.replace(/[\r\n]/g, " ")}`,
                html: `<p><strong>Name:</strong> ${safeName}</p><p><strong>Email:</strong> ${safeEmail}</p><p><strong>Message:</strong><br>${safeMessage}</p>`,
                text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
            })
        });

        if (!resendResponse.ok) {
            console.error("Resend rejected contact notification:", resendResponse.status);
            return response(request, 502, { error: "The email provider could not send the notification." });
        }

        return response(request, 200, { sent: true });
    } catch (error) {
        console.error("Contact notification request failed:", error instanceof Error ? error.message : "Unknown error");
        return response(request, 502, { error: "The email provider could not send the notification." });
    }
});
