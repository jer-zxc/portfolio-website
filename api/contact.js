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

    let resendResponse;
    try {
        resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: process.env.CONTACT_FROM_EMAIL ?? 'PORTFOLIO ZXC <onboarding@resend.dev>',
                to: [process.env.CONTACT_EMAIL],
                reply_to: email,
                subject: 'New portfolio message',
                text: `From: ${email}\n\n${message.trim()}`,
            }),
        });
    } catch (error) {
        console.error('Unable to reach Resend:', error);
        return response.status(502).json({ error: 'Email service is temporarily unavailable' });
    }

    if (!resendResponse.ok) {
        const details = await resendResponse.text();
        console.error(`Resend rejected the message (${resendResponse.status}):`, details);

        if (resendResponse.status === 401) {
            return response.status(502).json({ error: 'The email API key is invalid' });
        }
        if (resendResponse.status === 403 || resendResponse.status === 422) {
            return response.status(502).json({ error: 'The sender or receiving address is not verified' });
        }
        if (resendResponse.status === 429) {
            return response.status(429).json({ error: 'Too many messages—please try again shortly' });
        }
        return response.status(502).json({ error: 'Email delivery was rejected' });
    }

    return response.status(200).json({ ok: true });
}
