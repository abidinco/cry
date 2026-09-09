import type { ReactNode } from "react";
import { kisaAdres, tarihUtc, tutarParcala } from "@/lib/bicim";

/** Bilginin nereden geldiği — arayüzün taşıdığı dördüncü kanal. */
export type Koken = "kaynak" | "indeks" | "supheli" | "yok";

/**
 * Kayıt bloğu: solunda köken oluğuyla. Oluk süs değil, o bloktaki bilginin
 * kaynağını söylüyor ve okuyan "bu nereden geldi" diye sormak zorunda kalmıyor.
 */
const KOKEN_ACIKLAMA: Record<Koken, string> = {
  kaynak: "Bu bloktaki bilgi kaynağın kendi beyanı.",
  indeks: "Bu bloktaki bilgi bizim kayıtlarımızdan türetildi.",
  supheli: "Bu bloktaki bilgi doğrulanmadı ya da eksik bir taramadan geliyor.",
  yok: "Bu bloğun kaynağı bilinmiyor.",
};

export function Kayit({
  koken = "yok",
  baslik,
  sag,
  children,
}: {
  koken?: Koken;
  baslik?: ReactNode;
  sag?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="kayit" data-koken={koken} title={KOKEN_ACIKLAMA[koken]}>
      {(baslik || sag) && (
        <header
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 8,
          }}
        >
          {typeof baslik === "string" ? <h2 className="etiket">{baslik}</h2> : baslik}
          {sag}
        </header>
      )}
      {children}
    </section>
  );
}

export function Satir({
  ad,
  children,
  koken,
  not,
}: {
  ad: string;
  children: ReactNode;
  koken?: Koken;
  not?: string;
}) {
  return (
    <div className="satir">
      <span className="etiket">{ad}</span>
      <span>
        {children}
        {not && (
          <span className="koken-notu" data-koken={koken ?? "yok"}>
            {not}
          </span>
        )}
      </span>
    </div>
  );
}

export function Rozet({
  ton,
  children,
  baslik,
}: {
  ton?: "gelen" | "giden" | "hata" | "dikkat";
  children: ReactNode;
  baslik?: string;
}) {
  return (
    <span className="rozet" data-ton={ton} title={baslik}>
      {children}
    </span>
  );
}

/**
 * Tutar: küsurat sönük basılır, böylece büyüklük tek bakışta okunur. Sayıya
 * çevrilmez — biçimleme dizgi üzerinde yapılır.
 */
export function Tutar({
  ham,
  ondalik,
  sembol,
}: {
  ham: string;
  ondalik: number;
  sembol?: string;
}) {
  const { tam, kusurat, negatif } = tutarParcala(ham, ondalik);
  return (
    <span className="veri">
      {negatif && "−"}
      {tam}
      {kusurat && <span className="kusurat">,{kusurat}</span>}
      {sembol && <span className="m3"> {sembol}</span>}
    </span>
  );
}

export function Adres({ deger, zincir, kisa = true }: { deger: string; zincir?: string; kisa?: boolean }) {
  const metin = kisa ? kisaAdres(deger) : deger;
  if (!zincir) return <span className="veri" title={deger}>{metin}</span>;
  return (
    <a className="veri" href={`/adres/${zincir}/${deger}`} title={deger}>
      {metin}
    </a>
  );
}

/** Tarih TSİ basılır; UTC karşılığı başlıkta durur — rapor UTC istiyor. */
export function Tarih({ deger, metin }: { deger: string | Date | null; metin: string }) {
  return (
    <span className="veri" title={tarihUtc(deger)}>
      {metin}
    </span>
  );
}

/** Boş ekran bir mazeret değil, bir davettir. */
export function Bos({ children }: { children: ReactNode }) {
  return <div className="bos">{children}</div>;
}
