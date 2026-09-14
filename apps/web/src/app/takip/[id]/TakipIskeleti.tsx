/**
 * Takip sayfası yüklenirken gösterilen iskelet.
 *
 * Gerçek sayfanın ŞEKLİNİ taşır — üst şerit, solda sıçrama sütunları, sağda
 * özet çubukları ve defter satırları — ki veri geldiğinde hiçbir şey yer
 * değiştirmesin. Sütun yükseklikleri bilerek düzensiz: dört eşit blok bir
 * akış değil bir tablo gibi görünürdü.
 */

const SUTUNLAR: number[][] = [[88], [52, 18, 12, 6], [20, 12, 10, 8, 6], [8, 6, 6, 5, 5, 4, 4]];
const OZET = [78, 54, 30, 92, 26];

export default function TakipIskeleti() {
  return (
    <div aria-busy="true" aria-label="takip koşusu yükleniyor">
      <div className="takip-serit">
        <div className="takip-kimlik" style={{ gap: 6 }}>
          <div className="iskelet iskelet-satir" style={{ width: 180, height: 8 }} />
          <div className="iskelet iskelet-satir" style={{ width: 320 }} />
        </div>
        <span className="takip-bosluk" />
        <div className="iskelet iskelet-satir" style={{ width: 260 }} />
        <div className="iskelet iskelet-satir" style={{ width: 120 }} />
        <div className="iskelet" style={{ width: 150, height: 20 }} />
      </div>

      <div className="takip-govde">
        <section className="takip-sol">
          <div className="akis-lejant">
            {[120, 150, 130, 140].map((g, i) => (
              <div key={i} className="iskelet iskelet-satir" style={{ width: g, height: 8 }} />
            ))}
          </div>
          <div className="iskelet-sutunlar">
            {SUTUNLAR.map((sutun, i) => (
              <div key={i}>
                {sutun.map((yuzde, j) => (
                  <div key={j} className="iskelet" style={{ height: `${yuzde * 4}px`, maxHeight: "60vh" }} />
                ))}
              </div>
            ))}
          </div>
          <span />
        </section>

        <aside className="takip-sag">
          <div className="takip-ozet">
            <div className="iskelet iskelet-satir" style={{ width: 140 }} />
            {OZET.map((g, i) => (
              <div key={i} className="ozet-cubuk" style={{ cursor: "default" }}>
                <div className="iskelet iskelet-satir" style={{ width: 70 }} />
                <div className="iskelet iskelet-satir" style={{ width: `${g}%` }} />
                <div className="iskelet iskelet-satir" style={{ width: 44, justifySelf: "end" }} />
              </div>
            ))}
          </div>
          <div className="takip-filtre">
            <div className="iskelet iskelet-satir" style={{ width: 160, height: 8 }} />
          </div>
          <span />
          <div className="takip-defter" style={{ padding: "8px 14px", display: "grid", gap: 11, alignContent: "start" }}>
            {Array.from({ length: 14 }, (_, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 30px", gap: 10 }}>
                <div className="iskelet iskelet-satir" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
                <div className="iskelet iskelet-satir" />
                <div className="iskelet iskelet-satir" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
