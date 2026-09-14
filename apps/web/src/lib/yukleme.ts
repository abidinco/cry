/**
 * Sitenin üst yükleme çubuğunun durumu — kaç iş sürüyor.
 *
 * Uygulama `next/link` kullanmıyor; gezinme tam sayfa yüklemesi. Bu yüzden
 * "yükleniyor" iki parçadan oluşur: bağlantıya TIKLANDIĞI an (sayfa henüz
 * gitmedi) ve yeni sayfanın İLK verisi gelene kadar. İkincisini sayfanın
 * kendisi bildirir (`yuklemeIzle`), çünkü neyin "ilk yükleme" neyin arka
 * plan yoklaması olduğunu yalnızca o bilir — 3 saniyede bir tazelenen bir
 * koşu, çubuğu 3 saniyede bir yakmamalı.
 */

type Dinleyici = (surenIs: number) => void;

let suren = 0;
const dinleyiciler = new Set<Dinleyici>();

function bildir() {
  for (const d of dinleyiciler) d(suren);
}

/** Bir iş başlatır; dönen fonksiyon işi bitirir (iki kez çağrılması zararsız). */
export function yuklemeBaslat(): () => void {
  suren++;
  bildir();
  let bitti = false;
  return () => {
    if (bitti) return;
    bitti = true;
    suren = Math.max(0, suren - 1);
    bildir();
  };
}

/** Bir sözü izler: bitince (başarılı ya da hatalı) iş biter. */
export function yuklemeIzle<T>(soz: Promise<T>): Promise<T> {
  const bitir = yuklemeBaslat();
  return soz.finally(bitir);
}

/** Şu an süren iş sayısı. */
export function surenIs(): number {
  return suren;
}

export function yuklemeDinle(d: Dinleyici): () => void {
  dinleyiciler.add(d);
  d(suren);
  return () => {
    dinleyiciler.delete(d);
  };
}

/** Çubuğun ilerleyişi: gerçek bir yüzde değil, asimptotik bir işaret. */
export function sonrakiIlerleme(simdiki: number): number {
  // %90'a yaklaşır ama ulaşmaz — bitişi yalnızca işin kendisi söyler.
  return simdiki + (0.9 - simdiki) * 0.08;
}

/** Tıklanan bağlantı bu sitede yeni bir sayfa mı açacak? */
export function sayfaGecisiMi(
  hedef: { href: string; target: string; download: boolean },
  konum: { origin: string; pathname: string; search: string },
  tiklama: { button: number; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean },
): boolean {
  if (tiklama.button !== 0 || tiklama.ctrl || tiklama.meta || tiklama.shift || tiklama.alt) return false;
  if (hedef.download || (hedef.target && hedef.target !== "_self")) return false;
  let url: URL;
  try {
    url = new URL(hedef.href, konum.origin);
  } catch {
    return false;
  }
  if (url.origin !== konum.origin) return false;
  // Yalnızca çapa değişiyorsa sayfa yüklenmez.
  if (url.pathname === konum.pathname && url.search === konum.search) return false;
  return true;
}
