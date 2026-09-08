/**
 * İlk girişte şifre değiştirme. Kapı middleware'de: `mustChangePassword`
 * true iken başka hiçbir sayfaya gidilemez.
 *
 * DURUM: İSKELET — form ve uç nokta bir sonraki görevde yazılacak. Sayfanın
 * şimdi var olması gerekiyor, yoksa kapı kullanıcıyı 404'e kilitler.
 */
export default function SifreDegistirSayfasi() {
  return (
    <main className="kutu" style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 20 }}>Şifre değiştir</h1>
      <p className="soluk">
        İlk girişte şifre değiştirme zorunlu. Bu ekran bir sonraki görevde
        tamamlanacak.
      </p>
    </main>
  );
}
