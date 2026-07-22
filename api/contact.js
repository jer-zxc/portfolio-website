const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return response.status(405).json({ error: 'Method not allowed' });
    }

    const { email, message } = request.body ?? {};
    if (!EMAIL_PATTERN.test(email ?? '') || typeof message !== 'string' || !message.trim() || message.length > 5000) {
        return response.status(400).json({ error: 'Invalid form submission' });
    }

    if (!process.env.RESEND_API_KEY || !process.env.CONTACT_EMAIL) {
        return response.status(503).json({ error: 'Email service is not configured' });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: process.env.CONTACT_FROM_EMAIL ?? 'Portfolio <onboarding@resend.dev>',
            to: [process.env.CONTACT_EMAIL],
            reply_to: email,
            subject: 'New portfolio message',
            text: `From: ${email}\n\n${message.trim()}`,
        }),
    });

    if (!resendResponse.ok) {
        return response.status(502).json({ error: 'Email delivery failed' });
    }

    return response.status(200).json({ ok: true });
}
