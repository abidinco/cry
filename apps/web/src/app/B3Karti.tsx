import { b3Gorunum, type B3Olcumu } from "@/lib/b3-durum";

const TR = (n: number | null) => (n === null ? "—" : n.toLocaleString("tr-TR"));

/**
 * B3 geçmiş-doldurma kartı — karar masasındaki kartın AYNISI, aynı ölçümden.
 * Karar değil ÖLÇÜM: burada bir şey seçilmez, bakılır. Bayat ölçüm bayat diye
 * söylenir (bayat bir ölçüm ölçüm değildir); eskilik, doldurucunun durduğu
 * anlamına GELMEZ.
 */
export default function B3Karti({ olcum }: { olcum: B3Olcumu | null }) {
  if (!olcum) {
    return (
      <section className="panel b3-karti" data-koken="yok" aria-label="B3 geçmiş doldurma">
        <h2 className="b3-baslik">B3 — geçmiş doldurma</h2>
        <p className="b3-not">
          Rutin henüz yazmadı. «Sayı yok», «doldurucu durdu» demek değildir.
        </p>
      </section>
    );
  }
  const g = b3Gorunum(olcum);
  const olculdu = new Date(olcum.ts).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return (
    <section
      className="panel b3-karti"
      data-koken="indeks"
      data-surec={g.surec}
      aria-label="B3 geçmiş doldurma"
    >
      <h2 className="b3-baslik">B3 — geçmiş doldurma</h2>
      <div className="b3-ust">
        <span className="b3-yuzde">{g.yuzde}</span>
        <span className="b3-kalan">
          {TR(olcum.yazilan)} blok yazıldı · {TR(olcum.kalan)} blok kaldı
        </span>
        <span className="b3-rozet" data-surec={g.surec}>
          {g.rozet}
        </span>
      </div>
      <div
        className="b3-cubuk"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={g.oran === null ? undefined : Math.round(g.oran * 1000) / 10}
      >
        <i style={{ width: `${((g.oran ?? 0) * 100).toFixed(2)}%` }} />
      </div>
      <div className="b3-cubuk-alt">
        <span>genesis · blok 1</span>
        <span>uç · {TR(olcum.uc)}</span>
      </div>
      <dl className="b3-olculer">
        <div>
          <dt>cephe</dt>
          <dd>
            {TR(olcum.cephe)}
            <small>en düşük okunan blok</small>
          </dd>
        </div>
        <div>
          <dt>hız</dt>
          <dd>
            {olcum.hiz === null ? "—" : `${TR(olcum.hiz)} blok/sn`}
            <small>son günlük satırı</small>
          </dd>
        </div>
        <div>
          <dt>kalan süre</dt>
          <dd>
            {olcum.kalanSure ?? "—"}
            <small>doldurucunun kendi tahmini</small>
          </dd>
        </div>
        <div>
          <dt>boşluk</dt>
          <dd>
            {TR(olcum.bosluk)}
            <small>kapatıcı her 04:15&apos;te bakar</small>
          </dd>
        </div>
        <div>
          <dt>satır</dt>
          <dd>
            {olcum.satirMetni ?? TR(olcum.satir)}
            <small>transfer kaydı</small>
          </dd>
        </div>
        <div>
          <dt>indeks diski</dt>
          <dd>
            {olcum.indeksDiski ?? "—"}
            {olcum.diskBos && <small>D:&apos;de {olcum.diskBos} boş</small>}
          </dd>
        </div>
      </dl>
      {olcum.not && <p className="b3-not">{olcum.not}</p>}
      <p className="b3-olculdu">
        ölçüldü: {olculdu}
        {olcum.kaynak ? ` · ${olcum.kaynak}` : ""}
      </p>
      {g.bayat && g.yaslandi !== null && (
        <p className="b3-bayat">
          Bu sayılar {g.yaslandi.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} saat önce
          ölçüldü; rutin 6 saatte bir koşuyor. Sayının eskiliği doldurucunun durduğu anlamına
          GELMEZ.
        </p>
      )}
    </section>
  );
}
