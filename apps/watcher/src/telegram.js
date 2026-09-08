/**
 * Telegram bildirimi. SMTP sonraya bırakıldı.
 *
 * Bildirim gönderilemezse İŞ DÜŞMEZ: `sent` işaretlenmez ve bir sonraki turda
 * yeniden denenir. Sessizce "gönderildi" saymak, kaçırılan bir hareketi
 * görünmez yapar.
 */
const API = "https://api.telegram.org";

export async function telegramGonder(metin) {
  const jeton = process.env.TELEGRAM_BOT_TOKEN;
  const hedef = process.env.TELEGRAM_CHAT_ID;
  if (!jeton || !hedef) {
    console.warn("⊘ Telegram yapılandırılmamış — bildirim gönderilmedi");
    return false;
  }

  try {
    const yanit = await fetch(`${API}/bot${jeton}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: hedef,
        text: metin,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!yanit.ok) {
      console.error(`✗ Telegram ${yanit.status}: ${(await yanit.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (hata) {
    console.error("✗ Telegram gönderilemedi:", hata.message);
    return false;
  }
}
