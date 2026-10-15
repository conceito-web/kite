export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = {
      'Access-Control-Allow-Origin': allowedOrigin(origin) ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const reply = (body, status=200) => new Response(JSON.stringify(body), {
      status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control':'no-store' }
    });
    if (!allowedOrigin(origin)) return reply({ success:false, error:'Origem não autorizada.' }, 403);
    if (request.method !== 'POST') return reply({ success:false, error:'Use POST.' }, 405);
    if (!env.RESEND_API_KEY) return reply({ success:false, error:'A chave do serviço de e-mail não está configurada no servidor.' }, 500);
    let body;
    try { body = await request.json(); } catch { return reply({ success:false, error:'JSON inválido.' }, 400); }
    const { fileName, contentBase64, month, device } = body || {};
    if (typeof contentBase64 !== 'string' || contentBase64.length < 10 || contentBase64.length > 5_500_000) {
      return reply({ success:false, error:'Arquivo ausente ou maior que o limite de 4 MB.' }, 413);
    }
    if (!/^Conceito_(PC|Celular)_\d{4}-\d{2}\.json$/.test(fileName || '') || !/^\d{4}-\d{2}$/.test(month || '') || !['PC','Celular'].includes(device)) {
      return reply({ success:false, error:'Identificação do backup inválida.' }, 400);
    }
    // O destinatário é fixo no servidor; o navegador não pode escolher outros destinatários.
    const from = env.RESEND_FROM || 'Conceito Backup <onboarding@resend.dev>';
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: ['infane10@gmail.com'],
        subject: `Backup mensal Conceito - ${device} - ${month}`,
        text: `Backup mensal automático do Conceito.\nDispositivo: ${device}\nMês: ${month}\nArquivo JSON anexado.\n\nEste e-mail foi enviado pelo sistema Conceito.`,
        attachments: [{ filename: fileName, content: contentBase64 }]
      })
    });
    const result = await emailResponse.json().catch(() => ({}));
    if (!emailResponse.ok) {
      // Não revelar detalhes internos do fornecedor ao navegador.
      console.error('Resend error', emailResponse.status, result);
      return reply({ success:false, error:'O serviço de e-mail recusou o envio. O sistema tentará novamente na próxima abertura.' }, 502);
    }
    return reply({ success:true, id:result.id || null });
  }
};

function allowedOrigin(origin) {
  try {
    const u = new URL(origin);
    // Permite GitHub Pages e localhost para testes. Restrinja ao domínio exato se desejar.
    return u.protocol === 'https:' && (u.hostname === 'github.io' || u.hostname.endsWith('.github.io'))
      || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch { return false; }
}
